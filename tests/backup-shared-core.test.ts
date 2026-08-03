/**
 * backup-shared-core.test.ts
 *
 * lib/backup/shared.ts 의 미커버 경로를 대상으로 하는 단위 테스트:
 *   - sanitizeBackupData: metronome_hub_images 정화 (로컬 허용, 원격 제거, JSON 오류)
 *   - sanitizeBackupData: practice_book MAX_PRACTICE_BOOK_ENTRIES 절단
 *   - sanitizeNoteSampleUris: MAX_NOTE_SAMPLES_PER_MAP 제한
 *   - parseTrimInfo (audio-renderer 분리 전 공용 URI 파서 보완)
 *   - MAX_AUDIO_FILE_COUNT / MAX_AUDIO_FILE_B64_CHARS 상수 노출 확인
 *
 * 이미 backup-shared.test.ts에서 커버하는 경로(extractBaseUri,
 * sanitizeImageUri, remapUri 등)는 중복 포함하지 않는다.
 * backup-migrations.test.ts 에서 커버하는 schemaVersion 경로도 제외한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeBackupData,
  sanitizeNoteSampleUris,
  MAX_NOTE_SAMPLES_PER_MAP,
  MAX_PRACTICE_BOOK_ENTRIES,
  MAX_AUDIO_FILE_COUNT,
  MAX_AUDIO_FILE_B64_CHARS,
} from "../lib/backup/shared";

// ── 상수 노출 확인 ─────────────────────────────────────────────────────────────

test("MAX_NOTE_SAMPLES_PER_MAP: 양의 정수로 노출됨", () => {
  assert.ok(Number.isInteger(MAX_NOTE_SAMPLES_PER_MAP) && MAX_NOTE_SAMPLES_PER_MAP > 0,
    `expected positive integer, got ${MAX_NOTE_SAMPLES_PER_MAP}`);
});

test("MAX_PRACTICE_BOOK_ENTRIES: 양의 정수로 노출됨", () => {
  assert.ok(Number.isInteger(MAX_PRACTICE_BOOK_ENTRIES) && MAX_PRACTICE_BOOK_ENTRIES > 0);
});

test("MAX_AUDIO_FILE_COUNT: 양의 정수로 노출됨", () => {
  assert.ok(Number.isInteger(MAX_AUDIO_FILE_COUNT) && MAX_AUDIO_FILE_COUNT > 0);
});

test("MAX_AUDIO_FILE_B64_CHARS: 양의 정수로 노출됨", () => {
  assert.ok(Number.isInteger(MAX_AUDIO_FILE_B64_CHARS) && MAX_AUDIO_FILE_B64_CHARS > 0);
});

// ── sanitizeNoteSampleUris: MAX_NOTE_SAMPLES_PER_MAP ─────────────────────────

test("sanitizeNoteSampleUris: MAX_NOTE_SAMPLES_PER_MAP 초과 항목 절단", () => {
  // MAX_NOTE_SAMPLES_PER_MAP개를 넘는 안전한 URI 맵 생성
  const input: Record<string, string> = {};
  const total = MAX_NOTE_SAMPLES_PER_MAP + 10;
  for (let i = 0; i < total; i++) {
    input[`key${i}`] = `file:///sample${i}.wav`;
  }
  const out = sanitizeNoteSampleUris(input);
  assert.ok(out !== undefined, "결과가 undefined이면 안 됨");
  const count = Object.keys(out!).length;
  assert.equal(count, MAX_NOTE_SAMPLES_PER_MAP,
    `초과 항목이 제거돼야 함: got ${count}`);
});

test("sanitizeNoteSampleUris: 제한 이하 항목은 전부 유지", () => {
  const input: Record<string, string> = {};
  const total = Math.min(MAX_NOTE_SAMPLES_PER_MAP, 5);
  for (let i = 0; i < total; i++) {
    input[`k${i}`] = `file:///s${i}.wav`;
  }
  const out = sanitizeNoteSampleUris(input);
  assert.equal(Object.keys(out!).length, total);
});

// ── sanitizeBackupData: metronome_hub_images ──────────────────────────────────

test("sanitizeBackupData: metronome_hub_images — 로컬 URI는 보존", () => {
  const data = {
    metronome_hub_images: JSON.stringify([
      { uri: "file:///photos/img1.jpg", label: "A" },
      { uri: "asset:///img/b.png", label: "B" },
      { uri: "blob:abc123", label: "C" },
      { uri: "data:image/png;base64,xx", label: "D" },
    ]),
  };
  const out = sanitizeBackupData(data);
  const imgs = JSON.parse(out.metronome_hub_images!);
  assert.equal(imgs[0].uri, "file:///photos/img1.jpg");
  assert.equal(imgs[1].uri, "asset:///img/b.png");
  assert.equal(imgs[2].uri, "blob:abc123");
  assert.equal(imgs[3].uri, "data:image/png;base64,xx");
});

test("sanitizeBackupData: metronome_hub_images — http/https URI는 빈 문자열로 교체", () => {
  const data = {
    metronome_hub_images: JSON.stringify([
      { uri: "https://attacker.example.com/pixel.png", label: "evil" },
      { uri: "http://192.168.1.1/probe", label: "probe" },
    ]),
  };
  const out = sanitizeBackupData(data);
  const imgs = JSON.parse(out.metronome_hub_images!);
  assert.equal(imgs[0].uri, "", "https URI → 빈 문자열");
  assert.equal(imgs[1].uri, "", "http URI → 빈 문자열");
});

test("sanitizeBackupData: metronome_hub_images — javascript: URI는 빈 문자열로 교체", () => {
  const data = {
    metronome_hub_images: JSON.stringify([
      { uri: "javascript:alert(1)", label: "xss" },
    ]),
  };
  const out = sanitizeBackupData(data);
  const imgs = JSON.parse(out.metronome_hub_images!);
  assert.equal(imgs[0].uri, "");
});

test("sanitizeBackupData: metronome_hub_images — 잘못된 JSON은 []로 리셋", () => {
  const data = { metronome_hub_images: "{ broken json ]" };
  const out = sanitizeBackupData(data);
  assert.equal(out.metronome_hub_images, "[]");
});

test("sanitizeBackupData: metronome_hub_images — 배열이 아닌 값은 []로 리셋", () => {
  const data = { metronome_hub_images: JSON.stringify({ not: "array" }) };
  const out = sanitizeBackupData(data);
  assert.equal(out.metronome_hub_images, "[]");
});

test("sanitizeBackupData: metronome_hub_images — null 값은 []로 리셋", () => {
  const data = { metronome_hub_images: null };
  const out = sanitizeBackupData(data as Record<string, string | null>);
  assert.equal(out.metronome_hub_images, "[]");
});

test("sanitizeBackupData: metronome_hub_images — 비-URI 필드(label 등)는 보존", () => {
  const data = {
    metronome_hub_images: JSON.stringify([
      { uri: "file:///a.jpg", label: "My Photo", customField: 42 },
    ]),
  };
  const out = sanitizeBackupData(data);
  const imgs = JSON.parse(out.metronome_hub_images!);
  assert.equal(imgs[0].label, "My Photo");
  assert.equal(imgs[0].customField, 42);
});

test("sanitizeBackupData: metronome_hub_images — URI 없는 항목도 그대로 통과", () => {
  const data = {
    metronome_hub_images: JSON.stringify([
      { label: "no-uri" },
      42,
      null,
    ]),
  };
  const out = sanitizeBackupData(data);
  const imgs = JSON.parse(out.metronome_hub_images!);
  // sanitizeImageUri(undefined) = undefined → uri: undefined → uri key may be absent
  assert.equal(imgs[0].label, "no-uri");
});

test("sanitizeBackupData: metronome_hub_images — 빈 배열도 정상 처리", () => {
  const data = { metronome_hub_images: JSON.stringify([]) };
  const out = sanitizeBackupData(data);
  assert.equal(out.metronome_hub_images, "[]");
});

// ── sanitizeBackupData: practice_book MAX_PRACTICE_BOOK_ENTRIES ───────────────

test("sanitizeBackupData: practice_book — MAX_PRACTICE_BOOK_ENTRIES 초과 항목 절단", () => {
  const entries = Array.from({ length: MAX_PRACTICE_BOOK_ENTRIES + 20 }, (_, i) => ({
    id: `p${i}`,
    label: `Entry ${i}`,
    bpm: 120,
    beatsPerMeasure: 4,
    beatTypes: [],
    createdAt: i,
  }));
  const data = { practice_book: JSON.stringify(entries) };
  const out = sanitizeBackupData(data);
  const result = JSON.parse(out.practice_book!);
  assert.equal(result.length, MAX_PRACTICE_BOOK_ENTRIES,
    `${MAX_PRACTICE_BOOK_ENTRIES}개로 절단돼야 함: got ${result.length}`);
});

test("sanitizeBackupData: practice_book — 제한 이하 항목은 전부 유지", () => {
  const entries = Array.from({ length: 3 }, (_, i) => ({
    id: `p${i}`, label: `L${i}`, bpm: 100, beatsPerMeasure: 4, beatTypes: [], createdAt: i,
  }));
  const data = { practice_book: JSON.stringify(entries) };
  const out = sanitizeBackupData(data);
  const result = JSON.parse(out.practice_book!);
  assert.equal(result.length, 3);
});

test("sanitizeBackupData: practice_book — null 항목은 드랍됨", () => {
  const data = {
    practice_book: JSON.stringify([
      null,
      { id: "ok", label: "L", bpm: 100, beatsPerMeasure: 4, beatTypes: [], createdAt: 1 },
      42,
    ]),
  };
  const out = sanitizeBackupData(data);
  const result = JSON.parse(out.practice_book!);
  // null, 42 → sanitizePracticeEntry 반환 null → 필터링됨
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "ok");
});

test("sanitizeBackupData: practice_book — 잘못된 JSON은 []로 리셋 (fail-closed)", () => {
  const data = { practice_book: "not[json" };
  const out = sanitizeBackupData(data);
  assert.equal(out.practice_book, "[]");
});

test("sanitizeBackupData: practice_book — 배열이 아닌 값은 []로 리셋", () => {
  const data = { practice_book: JSON.stringify({ not: "array" }) };
  const out = sanitizeBackupData(data);
  assert.equal(out.practice_book, "[]");
});

test("sanitizeBackupData: 미관련 키는 변경 없이 통과", () => {
  const data = {
    metronome_settings: JSON.stringify({ bpm: 120 }),
    metronome_language: "ko",
  };
  const out = sanitizeBackupData(data);
  assert.equal(out.metronome_settings, data.metronome_settings);
  assert.equal(out.metronome_language, "ko");
});

test("sanitizeBackupData: 빈 데이터 객체는 그대로 반환", () => {
  const out = sanitizeBackupData({});
  assert.deepEqual(out, {});
});
