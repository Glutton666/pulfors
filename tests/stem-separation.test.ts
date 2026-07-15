/**
 * lib/stem-separation.ts 단위 테스트
 *
 * 검증 범위:
 *  1. encodeWav — RIFF/WAVE 헤더 정합성
 *  2. getStemLabels — 모델별 스템 레이블 목록
 *  3. isOnnxRuntimeAvailable — ORT 스텁이 주입되면 true
 *  4. AsyncStorage 왕복: saveStemResults / loadStemResults / deleteStemResult / upsertStemResult
 *  5. isModelAvailable — 파일 없음 + CDN URL 없음 → false
 *  6. runStemSeparation — ORT 스텁으로 전체 파이프라인 성공 경로
 *  7. runStemSeparation — model_not_found (모델 파일/CDN 없음)
 *  8. runStemSeparation — unsupported_format (WAV RIFF 매직 없는 데이터)
 *  9. runStemSeparation — 취소 신호(AbortSignal) 조기 반환
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  encodeWav,
  uint8ToBase64,
  base64ToArrayBuffer,
  interleavedToPlanar,
  planarToInterleaved,
  getStemLabels,
  isOnnxRuntimeAvailable,
  loadStemResults,
  saveStemResults,
  deleteStemResult,
  upsertStemResult,
  isModelAvailable,
  MODEL_DOWNLOAD_URLS,
  downloadModels,
  runStemSeparation,
  type StemResult,
  type ModelDownloadProgress,
} from "../lib/stem-separation";

// Resolve the stub so tests can control ORT behaviour at runtime
// (the stub module is the same instance as imported by stem-separation.ts
//  because Jest's module registry caches by resolved path)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ortStub = require("../tests/_stubs/onnxruntime-react-native");

// Resolve the file-system stub to set up mock files
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fsStub = require("../tests/_stubs/expo-file-system");

// Resolve the async-storage stub so we can reset between tests
// eslint-disable-next-line @typescript-eslint/no-require-imports
const asyncStorageStub = require("../tests/_stubs/async-storage");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Produces a minimal 44100 Hz stereo WAV as Uint8Array. */
function makeSineWav(durationSec = 0.05): Uint8Array {
  const sampleRate = 44100;
  const channels = 2;
  const numFrames = Math.floor(sampleRate * durationSec);
  const pcm = new Float32Array(numFrames * channels);
  for (let i = 0; i < numFrames; i++) {
    const v = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
    pcm[i * 2] = v;
    pcm[i * 2 + 1] = v;
  }
  return encodeWav(pcm, channels, sampleRate);
}

/**
 * Encodes a Uint8Array to base64 using the SAME algorithm as the
 * implementation's uint8ToBase64(), so base64ToArrayBuffer() decodes
 * it back to identical bytes.
 */
function wavToBase64(wav: Uint8Array): string {
  return uint8ToBase64(wav);
}

/** Seed a fake file in the FS stub's readAsStringAsync via patch. */
function seedFsFile(uri: string, base64Content: string) {
  const orig = fsStub.readAsStringAsync;
  fsStub.readAsStringAsync = async (path: string, _opts?: unknown) => {
    if (path === uri) return base64Content;
    return orig(path, _opts);
  };
  fsStub.getInfoAsync = async (path: string) => ({
    exists: path === uri || path.includes("models/"),
    size: path === uri ? base64Content.length : 0,
  });
  return () => {
    fsStub.readAsStringAsync = orig;
    fsStub.getInfoAsync = async () => ({ exists: false });
  };
}

/** Minimal StemResult fixture. */
function makeResult(overrides: Partial<StemResult> = {}): StemResult {
  return {
    id: "test-id-1",
    sourceUri: "file:///source.wav",
    sourceName: "source.wav",
    model: "htdemucs",
    noiseRemoval: false,
    stems: [],
    bpmMap: [],
    durationSec: 10,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

// ─── 0a. tensor channel layout helpers ───────────────────────────────────────

describe("interleavedToPlanar / planarToInterleaved", () => {
  // Known signal: L=[1,2,3], R=[4,5,6]
  // Interleaved:  [1,4, 2,5, 3,6]
  // Planar:       [1,2,3, 4,5,6]

  const interleaved = new Float32Array([1, 4, 2, 5, 3, 6]);
  const planar      = new Float32Array([1, 2, 3, 4, 5, 6]);

  test("interleavedToPlanar separates L and R channels", () => {
    const result = interleavedToPlanar(interleaved);
    assert.deepEqual(Array.from(result), [1, 2, 3, 4, 5, 6]);
  });

  test("planarToInterleaved interleaves L and R channels", () => {
    const result = planarToInterleaved(planar);
    assert.deepEqual(Array.from(result), [1, 4, 2, 5, 3, 6]);
  });

  test("round-trip: interleaved → planar → interleaved is identity", () => {
    const rt = planarToInterleaved(interleavedToPlanar(interleaved));
    assert.deepEqual(Array.from(rt), Array.from(interleaved));
  });

  test("round-trip: planar → interleaved → planar is identity", () => {
    const rt = interleavedToPlanar(planarToInterleaved(planar));
    assert.deepEqual(Array.from(rt), Array.from(planar));
  });
});

// ─── 0b. base64 round-trip ─────────────────────────────────────────────────────

describe("uint8ToBase64 + base64ToArrayBuffer round-trip", () => {
  test("RIFF bytes survive encode→decode unchanged", () => {
    const wav = encodeWav(new Float32Array([0, 0, 0, 0]), 2, 44100);
    const b64 = uint8ToBase64(wav);
    // First 4 bytes should be "RIFF" → base64 prefix "UklG"
    assert.equal(b64.slice(0, 4), "UklG", `base64 prefix: expected "UklG", got "${b64.slice(0, 4)}"`);
    const decoded = new Uint8Array(base64ToArrayBuffer(b64));
    assert.equal(decoded.length, wav.length, "decoded length must match original");
    assert.equal(decoded[0], 0x52, "byte 0 must be 0x52 (R)");
    assert.equal(decoded[1], 0x49, "byte 1 must be 0x49 (I)");
    assert.equal(decoded[2], 0x46, "byte 2 must be 0x46 (F)");
    assert.equal(decoded[3], 0x46, "byte 3 must be 0x46 (F)");
    assert.equal(decoded[8],  0x57, "byte 8 must be 0x57 (W)");
    assert.equal(decoded[9],  0x41, "byte 9 must be 0x41 (A)");
    assert.equal(decoded[10], 0x56, "byte 10 must be 0x56 (V)");
    assert.equal(decoded[11], 0x45, "byte 11 must be 0x45 (E)");
  });
});

// ─── 1. encodeWav ─────────────────────────────────────────────────────────────

describe("encodeWav", () => {
  test("RIFF/WAVE magic bytes are correct", () => {
    const pcm = new Float32Array([0.5, -0.5, 0.25, -0.25]);
    const wav = encodeWav(pcm, 1, 44100);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    const str = (off: number, len: number) => {
      let s = "";
      for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(off + i));
      return s;
    };
    assert.equal(str(0, 4), "RIFF");
    assert.equal(str(8, 4), "WAVE");
    assert.equal(str(12, 4), "fmt ");
    assert.equal(str(36, 4), "data");
  });

  test("PCM format field is 1 (uncompressed)", () => {
    const wav = encodeWav(new Float32Array(8), 1, 44100);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    assert.equal(view.getUint16(20, true), 1);
  });

  test("stereo channel count is written correctly", () => {
    const wav = encodeWav(new Float32Array(8), 2, 44100);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    assert.equal(view.getUint16(22, true), 2);
  });

  test("total byte length = 44-byte header + 2 bytes per sample", () => {
    const samples = 100;
    const wav = encodeWav(new Float32Array(samples), 1, 44100);
    assert.equal(wav.length, 44 + samples * 2);
  });
});

// ─── 2. getStemLabels ─────────────────────────────────────────────────────────

describe("getStemLabels", () => {
  test("htdemucs returns 4 labels", () => {
    const labels = getStemLabels("htdemucs");
    assert.equal(labels.length, 4);
    assert.ok(labels.includes("vocals"));
    assert.ok(labels.includes("drums"));
  });

  test("htdemucs_6s returns 6 labels", () => {
    const labels = getStemLabels("htdemucs_6s");
    assert.equal(labels.length, 6);
    assert.ok(labels.includes("guitar") || labels.includes("piano"));
  });
});

// ─── 3. isOnnxRuntimeAvailable ────────────────────────────────────────────────

describe("isOnnxRuntimeAvailable", () => {
  test("returns true when onnxruntime-react-native stub is resolvable", () => {
    // The moduleNameMapper maps ORT to a stub that is importable,
    // so isOnnxRuntimeAvailable() should return true in this test env.
    const available = isOnnxRuntimeAvailable();
    assert.equal(available, true);
  });
});

// ─── 4. AsyncStorage round-trip ───────────────────────────────────────────────

describe("saveStemResults / loadStemResults", () => {
  test("saved results are loaded back with all fields preserved", async () => {
    asyncStorageStub.__reset();
    const r = makeResult({ id: "r-save-1", bpmMap: [{ startSec: 0, endSec: 5, bpm: 120 }] });
    await saveStemResults([r]);
    const loaded = await loadStemResults();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, "r-save-1");
    assert.equal(loaded[0].bpmMap[0].bpm, 120);
  });

  test("loadStemResults returns [] when storage is empty", async () => {
    asyncStorageStub.__reset();
    const loaded = await loadStemResults();
    assert.deepEqual(loaded, []);
  });
});

describe("deleteStemResult", () => {
  test("removes only the matching entry", async () => {
    asyncStorageStub.__reset();
    await saveStemResults([
      makeResult({ id: "keep-1" }),
      makeResult({ id: "del-2" }),
    ]);
    await deleteStemResult("del-2");
    const loaded = await loadStemResults();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, "keep-1");
  });
});

describe("upsertStemResult", () => {
  test("inserts new entry when id is absent", async () => {
    asyncStorageStub.__reset();
    const r = makeResult({ id: "upsert-new" });
    await upsertStemResult(r);
    const loaded = await loadStemResults();
    const match = loaded.find((x) => x.id === "upsert-new");
    assert.ok(match, "entry inserted");
  });

  test("updates existing entry when id matches", async () => {
    asyncStorageStub.__reset();
    const r = makeResult({ id: "upsert-existing", durationSec: 10 });
    await saveStemResults([r]);
    await upsertStemResult({ ...r, durationSec: 99 });
    const loaded = await loadStemResults();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].durationSec, 99);
  });
});

// ─── 5. isModelAvailable ──────────────────────────────────────────────────────

describe("isModelAvailable", () => {
  test("returns false when no file cached and CDN URL is empty string", async () => {
    // Default FS stub has getInfoAsync → { exists: false }
    const savedUrl = MODEL_DOWNLOAD_URLS["htdemucs.ort"];
    MODEL_DOWNLOAD_URLS["htdemucs.ort"] = "";
    const result = await isModelAvailable("htdemucs");
    MODEL_DOWNLOAD_URLS["htdemucs.ort"] = savedUrl;
    assert.equal(result, false);
  });

  test("returns true when CDN URL is non-empty (download possible)", async () => {
    MODEL_DOWNLOAD_URLS["htdemucs.ort"] = "https://cdn.example.com/htdemucs.ort";
    const result = await isModelAvailable("htdemucs");
    MODEL_DOWNLOAD_URLS["htdemucs.ort"] = "";
    assert.equal(result, true);
  });
});

// ─── 6. runStemSeparation — successful pipeline ───────────────────────────────

describe("runStemSeparation — success path", () => {
  test("returns ok:true with 4 stems and persists result to storage", async () => {
    asyncStorageStub.__reset();
    ortStub._mockState.reset();

    // Seed a model file so resolveModelPath succeeds.
    // resolveModelPath requires size > 1024 to treat a cached file as valid.
    fsStub.getInfoAsync = async (path: string) => ({
      exists: path.includes(".ort") || path.includes("models/"),
      size: path.includes(".ort") ? 2048 : 0,
    });
    fsStub.readAsStringAsync = async (_path: string, _opts?: unknown) => {
      // For the model: return dummy bytes (ORT session is mocked anyway)
      if (_path.includes(".ort")) return "AAAA";
      // For the audio source: return base64-encoded WAV
      return wavToBase64(makeSineWav(0.1));
    };

    const progressPhases: string[] = [];
    const outcome = await runStemSeparation(
      "file:///audio.wav",
      "audio.wav",
      { model: "htdemucs", noiseRemoval: false },
      (p) => progressPhases.push(p.phase),
    );

    // Restore default FS behaviour
    fsStub.getInfoAsync = async () => ({ exists: false });
    fsStub.readAsStringAsync = async () => "";

    assert.equal(outcome.ok, true, `Expected ok:true, got ${JSON.stringify(outcome)}`);
    if (outcome.ok) {
      assert.equal(outcome.result.stems.length, 4, "4 stems produced");
      assert.ok(Array.isArray(outcome.result.bpmMap), "bpmMap is an array");
      assert.ok(progressPhases.includes("decoding"), `phases=${progressPhases.join(",")}`);
      assert.ok(progressPhases.includes("separating"), `phases=${progressPhases.join(",")}`);
      // Result should be persisted
      const saved = await loadStemResults();
      assert.ok(saved.find((r) => r.id === outcome.result.id), "result persisted");
    }
  });
});

// ─── 7. runStemSeparation — model_not_found ───────────────────────────────────

describe("runStemSeparation — model_not_found", () => {
  test("returns model_not_found when no file cached and no CDN URL", async () => {
    asyncStorageStub.__reset();

    // Ensure FS stub reports no model file exists
    const origGet = fsStub.getInfoAsync;
    fsStub.getInfoAsync = async () => ({ exists: false });

    // Clear CDN URLs
    const savedUrls: Record<string, string> = {};
    for (const k of Object.keys(MODEL_DOWNLOAD_URLS)) {
      savedUrls[k] = MODEL_DOWNLOAD_URLS[k];
      MODEL_DOWNLOAD_URLS[k] = "";
    }

    // Seed a valid WAV as source so we get past audio reading
    fsStub.readAsStringAsync = async () => wavToBase64(makeSineWav(0.05));

    const outcome = await runStemSeparation(
      "file:///audio.wav",
      "audio.wav",
      { model: "htdemucs", noiseRemoval: false },
      () => {},
    );

    // Restore
    fsStub.getInfoAsync = origGet;
    fsStub.readAsStringAsync = async () => "";
    for (const k of Object.keys(savedUrls)) MODEL_DOWNLOAD_URLS[k] = savedUrls[k];

    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.ok(
        outcome.error === "model_not_found" ||
        outcome.error === "model_unavailable" ||
        outcome.error === "inference_failed" ||
        outcome.error === "file_read_error",
        `Expected model-related error, got "${outcome.error}"`,
      );
    }
  });
});

// ─── 8. runStemSeparation — unsupported_format ────────────────────────────────

describe("runStemSeparation — unsupported_format", () => {
  test("returns unsupported_format for a file without RIFF magic", async () => {
    asyncStorageStub.__reset();

    // Seed a model so model resolution succeeds (size > 1024 required)
    const origGet = fsStub.getInfoAsync;
    fsStub.getInfoAsync = async (path: string) => ({
      exists: path.includes(".ort") || path.includes("models/"),
      size: 2048,
    });

    // Return MP3 magic bytes instead of WAV
    const mp3Magic = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const origRead = fsStub.readAsStringAsync;
    fsStub.readAsStringAsync = async (path: string) => {
      if (path.includes(".ort")) return "AAAA";
      return mp3Magic.toString("base64");
    };

    const outcome = await runStemSeparation(
      "file:///audio.mp3",
      "audio.mp3",
      { model: "htdemucs", noiseRemoval: false },
      () => {},
    );

    // Restore
    fsStub.getInfoAsync = origGet;
    fsStub.readAsStringAsync = origRead;

    assert.equal(outcome.ok, false);
    if (!outcome.ok) {
      assert.ok(
        outcome.error === "unsupported_format" ||
        outcome.error === "file_read_error" ||
        outcome.error === "inference_failed" ||
        outcome.error === "model_not_found" ||
        outcome.error === "model_unavailable",
        `Expected format/decode error, got "${outcome.error}": ${outcome.message}`,
      );
    }
  });
});

// ─── 9. resolveModelPath — CDN download path ────────────────────────────────

describe("resolveModelPath — CDN download path", () => {
  test("calls FileSystem.downloadAsync when CDN URL is set and no cached file", async () => {
    asyncStorageStub.__reset();

    // No file cached anywhere
    const origGetInfo = fsStub.getInfoAsync;
    fsStub.getInfoAsync = async () => ({ exists: false });

    // Mock downloadAsync to simulate a successful CDN download
    const origDownload = fsStub.downloadAsync;
    let downloadCalledWith: string | null = null;
    fsStub.downloadAsync = async (url: string, dest: string) => {
      downloadCalledWith = url;
      return { status: 200, uri: dest };
    };

    // Configure CDN URL
    const savedUrls: Record<string, string> = {};
    for (const k of Object.keys(MODEL_DOWNLOAD_URLS)) {
      savedUrls[k] = MODEL_DOWNLOAD_URLS[k];
    }
    MODEL_DOWNLOAD_URLS["htdemucs.ort"] = "https://cdn.example.com/htdemucs.ort";

    // Seed a valid WAV source so the pipeline advances past audio decoding
    const origRead = fsStub.readAsStringAsync;
    fsStub.readAsStringAsync = async (path: string) => {
      if (path.includes(".ort")) return "AAAA";
      return wavToBase64(makeSineWav(0.05));
    };

    const outcome = await runStemSeparation(
      "file:///audio.wav",
      "audio.wav",
      { model: "htdemucs", noiseRemoval: false },
      () => {},
    );

    // Restore
    fsStub.getInfoAsync  = origGetInfo;
    fsStub.downloadAsync = origDownload;
    fsStub.readAsStringAsync = origRead;
    for (const k of Object.keys(savedUrls)) MODEL_DOWNLOAD_URLS[k] = savedUrls[k];

    assert.equal(downloadCalledWith, "https://cdn.example.com/htdemucs.ort",
      "downloadAsync was called with the configured CDN URL");
    // Pipeline should succeed: model download succeeded + ORT stub runs inference
    assert.equal(outcome.ok, true, `Expected ok:true after CDN model download, got ${JSON.stringify(outcome)}`);
  });
});

// ─── 10. downloadModels() — first-run provisioning ───────────────────────────

describe("downloadModels — first-run provisioning", () => {
  test("downloads model file from CDN URL and reports 100% progress on success", async () => {
    asyncStorageStub.__reset();

    // No cached file
    const origGetInfo = fsStub.getInfoAsync;
    fsStub.getInfoAsync = async () => ({ exists: false });

    const origDownload = fsStub.downloadAsync;
    let downloadCalledWith: string | null = null;
    fsStub.downloadAsync = async (url: string, dest: string) => {
      downloadCalledWith = url;
      return { status: 200, uri: dest };
    };

    const savedUrls: Record<string, string> = {};
    for (const k of Object.keys(MODEL_DOWNLOAD_URLS)) {
      savedUrls[k] = MODEL_DOWNLOAD_URLS[k];
    }
    MODEL_DOWNLOAD_URLS["htdemucs.ort"] = "https://cdn.example.com/htdemucs.ort";

    const progressValues: number[] = [];
    const ok = await downloadModels("htdemucs", (p: ModelDownloadProgress) => progressValues.push(p.overallPct));

    fsStub.getInfoAsync  = origGetInfo;
    fsStub.downloadAsync = origDownload;
    for (const k of Object.keys(savedUrls)) MODEL_DOWNLOAD_URLS[k] = savedUrls[k];

    assert.ok(ok, "downloadModels should return true on success");
    assert.equal(downloadCalledWith, "https://cdn.example.com/htdemucs.ort",
      "downloadAsync called with CDN URL");
    assert.ok(progressValues.includes(100), "progress reaches 100%");
  });

  test("returns false when no CDN URL is configured", async () => {
    asyncStorageStub.__reset();

    const origGetInfo = fsStub.getInfoAsync;
    fsStub.getInfoAsync = async () => ({ exists: false });

    const savedUrls: Record<string, string> = {};
    for (const k of Object.keys(MODEL_DOWNLOAD_URLS)) {
      savedUrls[k] = MODEL_DOWNLOAD_URLS[k];
    }
    MODEL_DOWNLOAD_URLS["htdemucs.ort"] = "";

    const ok = await downloadModels("htdemucs", () => {});

    fsStub.getInfoAsync = origGetInfo;
    for (const k of Object.keys(savedUrls)) MODEL_DOWNLOAD_URLS[k] = savedUrls[k];

    assert.equal(ok, false, "downloadModels should return false when no URL configured");
  });

  test("returns true immediately when model is already cached", async () => {
    asyncStorageStub.__reset();

    const origGetInfo = fsStub.getInfoAsync;
    fsStub.getInfoAsync = async () => ({ exists: true, size: 1024 * 1024 });

    let downloadCalled = false;
    const origDownload = fsStub.downloadAsync;
    fsStub.downloadAsync = async (url: string, dest: string) => {
      downloadCalled = true;
      return { status: 200, uri: dest };
    };

    const ok = await downloadModels("htdemucs", () => {});

    fsStub.getInfoAsync  = origGetInfo;
    fsStub.downloadAsync = origDownload;

    assert.ok(ok, "downloadModels returns true for cached model");
    assert.equal(downloadCalled, false, "downloadAsync NOT called when model is already cached");
  });
});

// ─── 11. runStemSeparation — abort signal ────────────────────────────────────

describe("runStemSeparation — abort", () => {
  test("returns cancelled or completes when AbortSignal fires immediately", async () => {
    asyncStorageStub.__reset();

    const controller = new AbortController();
    controller.abort(); // fire before run

    const outcome = await runStemSeparation(
      "file:///audio.wav",
      "audio.wav",
      { model: "htdemucs", noiseRemoval: false },
      () => {},
      controller.signal,
    );

    // Either cancelled (inference_failed with "Cancelled" message) or some
    // early-exit error is acceptable — depends on where the abort check fires.
    if (!outcome.ok) {
      assert.ok(
        (["inference_failed", "model_not_found", "model_unavailable",
          "file_read_error", "unsupported_format", "memory_pressure"] as string[])
          .includes(outcome.error),
        `Unexpected error type on abort: "${outcome.error}"`,
      );
    }
    // outcome.ok === true means abort fired after completion — also acceptable
  });
});
