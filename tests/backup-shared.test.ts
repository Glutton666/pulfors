import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractBaseUri,
  extractFragment,
  filenameFromUri,
  sanitizeAudioFilename,
  sanitizeNoteSampleUris,
  sanitizeNoteSampleChannelMap,
  sanitizeBackupData,
  sanitizeCustomSoundSetsJson,
  collectUrisFromSampleMap,
  collectAllAudioUris,
  remapUri,
  remapSampleMap,
  remapDataUris,
  formatDateForFilename,
  ALL_KEYS,
} from "../lib/backup/shared";

test("extractBaseUri: # fragment 제거", () => {
  assert.equal(extractBaseUri("file:///a/b.wav#v=1"), "file:///a/b.wav");
  assert.equal(extractBaseUri("file:///a/b.wav"), "file:///a/b.wav");
  assert.equal(extractBaseUri(""), "");
});

test("extractFragment: # 이후 추출", () => {
  assert.equal(extractFragment("file:///a/b.wav#v=1"), "#v=1");
  assert.equal(extractFragment("file:///a/b.wav"), "");
  assert.equal(extractFragment("a#b#c"), "#b#c");
});

test("filenameFromUri: 마지막 세그먼트 추출, fragment 제외", () => {
  assert.equal(filenameFromUri("file:///dir/sample.wav"), "sample.wav");
  assert.equal(filenameFromUri("file:///dir/sample.wav#v=2"), "sample.wav");
  assert.equal(filenameFromUri("a/b/c/d.mp3"), "d.mp3");
});

test("filenameFromUri: 빈 끝 세그먼트는 fallback", () => {
  const fb = filenameFromUri("file:///dir/");
  assert.match(fb, /^sample_\d+$/);
});

test("sanitizeAudioFilename: 위험 문자 제거 + 확장자 보존", () => {
  const r = sanitizeAudioFilename("../../../etc/passwd.wav");
  assert.match(r, /^passwd_[a-z0-9]+\.wav$/);
});

test("sanitizeAudioFilename: 한글 stem 유지", () => {
  const r = sanitizeAudioFilename("드럼킥.mp3");
  assert.match(r, /^드럼킥_[a-z0-9]+\.mp3$/);
});

test("sanitizeAudioFilename: 확장자 없으면 .bin", () => {
  const r = sanitizeAudioFilename("nofile");
  assert.match(r, /^nofile_[a-z0-9]+\.bin$/);
});

test("sanitizeAudioFilename: 매번 다른 suffix", () => {
  const a = sanitizeAudioFilename("a.wav");
  const b = sanitizeAudioFilename("a.wav");
  assert.notEqual(a, b);
});

test("sanitizeAudioFilename: 윈도우 백슬래시 경로 처리", () => {
  const r = sanitizeAudioFilename("C:\\Users\\foo\\bar.wav");
  assert.match(r, /^bar_[a-z0-9]+\.wav$/);
});

test("sanitizeNoteSampleUris: 안전한 스킴만 통과", () => {
  const input = {
    a: "file:///local/a.wav",
    b: "asset:///pkg/b.wav",
    c: "blob:abc",
    d: "data:audio/wav;base64,xx",
    e: "https://evil.example.com/x.wav",
    f: "javascript:alert(1)",
  };
  const out = sanitizeNoteSampleUris(input);
  assert.ok(out);
  assert.equal(out!.a, "file:///local/a.wav");
  assert.equal(out!.b, "asset:///pkg/b.wav");
  assert.equal(out!.c, "blob:abc");
  assert.equal(out!.d, "data:audio/wav;base64,xx");
  assert.equal(out!.e, undefined);
  assert.equal(out!.f, undefined);
});

test("sanitizeNoteSampleUris: undefined 그대로 반환", () => {
  assert.equal(sanitizeNoteSampleUris(undefined), undefined);
});

test("sanitizeNoteSampleUris: 비문자열 값 무시", () => {
  const input = { a: 123 as any, b: "file:///ok.wav" };
  const out = sanitizeNoteSampleUris(input);
  assert.equal(out!.a, undefined);
  assert.equal(out!.b, "file:///ok.wav");
});

test("sanitizeBackupData: @note_samples 안의 위험 URI 제거", () => {
  const data = {
    "@note_samples": JSON.stringify({
      a: "file:///ok.wav",
      b: "https://evil.example.com/x.wav",
    }),
  };
  const out = sanitizeBackupData(data);
  const parsed = JSON.parse(out["@note_samples"]!);
  assert.equal(parsed.a, "file:///ok.wav");
  assert.equal(parsed.b, undefined);
});

test("sanitizeBackupData: practice_book의 noteSamples 정화", () => {
  const data = {
    practice_book: JSON.stringify([
      {
        id: "x",
        label: "t",
        bpm: 120,
        beatsPerMeasure: 4,
        beatTypes: [],
        createdAt: 1,
        noteSamples: { a: "file:///ok.wav", b: "https://evil/x.wav" },
        noteQueueEntries: [
          {
            id: "y",
            noteSamples: { c: "file:///c.wav", d: "javascript:1" },
          },
        ],
      },
    ]),
  };
  const out = sanitizeBackupData(data);
  const entries = JSON.parse(out.practice_book!);
  assert.equal(entries[0].noteSamples.a, "file:///ok.wav");
  assert.equal(entries[0].noteSamples.b, undefined);
  assert.equal(entries[0].noteQueueEntries[0].noteSamples.c, "file:///c.wav");
  assert.equal(entries[0].noteQueueEntries[0].noteSamples.d, undefined);
});

test("sanitizeBackupData: 잘못된 JSON은 조용히 통과", () => {
  const data = {
    "@note_samples": "{ not valid",
    practice_book: "}}}",
  };
  const out = sanitizeBackupData(data);
  assert.equal(out["@note_samples"], "{ not valid");
  assert.equal(out.practice_book, "}}}");
});

test("collectUrisFromSampleMap: filename → baseUri 매핑", () => {
  const m = collectUrisFromSampleMap({
    a: "file:///dir/x.wav#v=1",
    b: "file:///dir/y.mp3",
  });
  assert.equal(m.get("x.wav"), "file:///dir/x.wav");
  assert.equal(m.get("y.mp3"), "file:///dir/y.mp3");
});

test("collectUrisFromSampleMap: undefined 빈 map", () => {
  assert.equal(collectUrisFromSampleMap(undefined).size, 0);
});

test("collectAllAudioUris: notes + practice_book 병합", () => {
  const m = collectAllAudioUris({
    "@note_samples": JSON.stringify({ a: "file:///dir/x.wav" }),
    practice_book: JSON.stringify([
      { id: "1", noteSamples: { b: "file:///dir/y.wav" } },
    ]),
  });
  assert.equal(m.get("x.wav"), "file:///dir/x.wav");
  assert.equal(m.get("y.wav"), "file:///dir/y.wav");
});

test("collectAllAudioUris: 손상된 JSON은 무시", () => {
  const m = collectAllAudioUris({
    "@note_samples": "broken",
    practice_book: null,
  });
  assert.equal(m.size, 0);
});

test("remapUri: filename 매치되면 새 base + fragment 보존", () => {
  const map = new Map([["x.wav", "file:///new/x.wav"]]);
  assert.equal(remapUri("file:///old/x.wav#v=2", map), "file:///new/x.wav#v=2");
});

test("remapUri: 매치 없으면 원본 반환", () => {
  const map = new Map([["other.wav", "file:///new/other.wav"]]);
  assert.equal(remapUri("file:///old/x.wav", map), "file:///old/x.wav");
});

test("remapSampleMap: 모든 키 매핑", () => {
  const samples = { a: "file:///old/x.wav", b: "file:///old/y.wav" };
  const map = new Map([
    ["x.wav", "file:///new/x.wav"],
    ["y.wav", "file:///new/y.wav"],
  ]);
  const out = remapSampleMap(samples, map);
  assert.deepEqual(out, { a: "file:///new/x.wav", b: "file:///new/y.wav" });
});

test("remapDataUris: @note_samples + practice_book 모두 remap", () => {
  const data = {
    "@note_samples": JSON.stringify({ a: "file:///old/x.wav" }),
    practice_book: JSON.stringify([
      { id: "1", noteSamples: { b: "file:///old/y.wav" } },
    ]),
  };
  const map = new Map([
    ["x.wav", "file:///new/x.wav"],
    ["y.wav", "file:///new/y.wav"],
  ]);
  const out = remapDataUris(data, map);
  assert.equal(JSON.parse(out["@note_samples"]!).a, "file:///new/x.wav");
  assert.equal(
    JSON.parse(out.practice_book!)[0].noteSamples.b,
    "file:///new/y.wav",
  );
});

test("formatDateForFilename: YYYYMMDD_HHmm 형식", () => {
  const r = formatDateForFilename();
  assert.match(r, /^\d{8}_\d{4}$/);
});

test("ALL_KEYS: @note_sample_channels 포함", () => {
  assert.ok(ALL_KEYS.includes("@note_sample_channels"));
});

test("sanitizeCustomSoundSetsJson: 안전한 URI는 그대로 보존", () => {
  const input = JSON.stringify({
    custom1: {
      name: "My Set",
      strong: { type: "custom", sampleUri: "file:///local/kick.wav", sampleName: "kick", duration: 0.3 },
      accent: { type: "custom", sampleUri: "asset:///pkg/hi.wav", duration: 0.2 },
      normal: { type: "custom", sampleUri: "blob:abc123", duration: 0.1 },
    },
  });
  const out = JSON.parse(sanitizeCustomSoundSetsJson(input));
  assert.equal(out.custom1.strong.sampleUri, "file:///local/kick.wav");
  assert.equal(out.custom1.accent.sampleUri, "asset:///pkg/hi.wav");
  assert.equal(out.custom1.normal.sampleUri, "blob:abc123");
});

test("sanitizeCustomSoundSetsJson: http/https URI는 제거되고 type=builtin으로 강등", () => {
  const input = JSON.stringify({
    custom1: {
      name: "Evil Set",
      strong: { type: "custom", sampleUri: "https://attacker.example.com/track.mp3", sampleName: "evil", duration: 0.5 },
      accent: { type: "custom", sampleUri: "http://192.168.1.1:8080/probe", sampleName: "probe", duration: 0.1 },
      normal: { type: "builtin", sourceSet: "classic", sourceRole: "low", duration: 0.1 },
    },
  });
  const out = JSON.parse(sanitizeCustomSoundSetsJson(input));
  assert.equal(out.custom1.strong.sampleUri, undefined);
  assert.equal(out.custom1.strong.sampleName, undefined);
  assert.equal(out.custom1.strong.type, "builtin");
  assert.equal(out.custom1.accent.sampleUri, undefined);
  assert.equal(out.custom1.accent.sampleName, undefined);
  assert.equal(out.custom1.accent.type, "builtin");
  assert.equal(out.custom1.normal.sampleUri, undefined);
});

test("sanitizeCustomSoundSetsJson: javascript: URI는 제거", () => {
  const input = JSON.stringify({
    custom2: {
      name: "xss",
      strong: { type: "custom", sampleUri: "javascript:alert(1)", duration: 0 },
      accent: { type: "builtin", duration: 0 },
      normal: { type: "builtin", duration: 0 },
    },
  });
  const out = JSON.parse(sanitizeCustomSoundSetsJson(input));
  assert.equal(out.custom2.strong.sampleUri, undefined);
  assert.equal(out.custom2.strong.type, "builtin");
});

test("sanitizeCustomSoundSetsJson: data: URI는 보존", () => {
  const input = JSON.stringify({
    custom3: {
      name: "inline",
      strong: { type: "custom", sampleUri: "data:audio/wav;base64,UklGR", duration: 0.1 },
      accent: { type: "builtin", duration: 0 },
      normal: { type: "builtin", duration: 0 },
    },
  });
  const out = JSON.parse(sanitizeCustomSoundSetsJson(input));
  assert.equal(out.custom3.strong.sampleUri, "data:audio/wav;base64,UklGR");
});

test("sanitizeCustomSoundSetsJson: 손상된 JSON은 원본 반환", () => {
  const bad = "{ not valid json }}}";
  assert.equal(sanitizeCustomSoundSetsJson(bad), bad);
});

test("sanitizeCustomSoundSetsJson: 배열/비객체 최상위는 원본 반환", () => {
  const arr = JSON.stringify([1, 2, 3]);
  assert.equal(sanitizeCustomSoundSetsJson(arr), arr);
});

test("sanitizeBackupData: metronome_custom_sound_sets의 위험 URI 제거", () => {
  const data = {
    "metronome_custom_sound_sets": JSON.stringify({
      custom1: {
        name: "Test",
        strong: { type: "custom", sampleUri: "https://evil.example.com/x.mp3", sampleName: "evil", duration: 0.5 },
        accent: { type: "custom", sampleUri: "file:///local/ok.wav", duration: 0.2 },
        normal: { type: "builtin", duration: 0.1 },
      },
    }),
  };
  const out = sanitizeBackupData(data);
  const parsed = JSON.parse(out["metronome_custom_sound_sets"]!);
  assert.equal(parsed.custom1.strong.sampleUri, undefined);
  assert.equal(parsed.custom1.strong.type, "builtin");
  assert.equal(parsed.custom1.accent.sampleUri, "file:///local/ok.wav");
});

test("sanitizeNoteSampleChannelMap: 유효 값 유지, 잘못된 값은 'both'", () => {
  const out = sanitizeNoteSampleChannelMap({
    a: "left",
    b: "right",
    c: "both",
    d: "stereo",
    e: 42 as unknown,
    f: null as unknown,
  });
  assert.deepEqual(out, {
    a: "left",
    b: "right",
    c: "both",
    d: "both",
    e: "both",
    f: "both",
  });
});

test("sanitizeNoteSampleChannelMap: undefined 그대로 반환", () => {
  assert.equal(sanitizeNoteSampleChannelMap(undefined), undefined);
});

test("sanitizeBackupData: @note_sample_channels 정화", () => {
  const data = {
    "@note_sample_channels": JSON.stringify({
      "0-0": "left",
      "1-0": "bogus",
      "2-0": "right",
    }),
  };
  const out = sanitizeBackupData(data);
  const parsed = JSON.parse(out["@note_sample_channels"]!);
  assert.deepEqual(parsed, {
    "0-0": "left",
    "1-0": "both",
    "2-0": "right",
  });
});

test("sanitizeBackupData: 잘못된 channels JSON 통과", () => {
  const data = { "@note_sample_channels": "{ broken" };
  const out = sanitizeBackupData(data);
  assert.equal(out["@note_sample_channels"], "{ broken");
});

test("sanitizeBackupData: practice_book의 noteSampleChannels (entry+queue) 정화", () => {
  const data = {
    practice_book: JSON.stringify([
      {
        id: "x",
        label: "t",
        bpm: 120,
        beatsPerMeasure: 4,
        beatTypes: [],
        createdAt: 1,
        noteSampleChannels: { "0-0": "left", "1-0": "weird" },
        noteQueueEntries: [
          {
            id: "y",
            noteSampleChannels: { "0-0": "right", "1-0": 5 },
          },
        ],
      },
    ]),
  };
  const out = sanitizeBackupData(data);
  const entries = JSON.parse(out.practice_book!);
  assert.deepEqual(entries[0].noteSampleChannels, {
    "0-0": "left",
    "1-0": "both",
  });
  assert.deepEqual(entries[0].noteQueueEntries[0].noteSampleChannels, {
    "0-0": "right",
    "1-0": "both",
  });
});
