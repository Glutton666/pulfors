import { test } from "node:test";
import assert from "node:assert/strict";
import { TUNING_DATA } from "../lib/tuning-data";

test("TUNING_DATA: 비어있지 않음", () => {
  assert.ok(TUNING_DATA.length > 0);
});

test("TUNING_DATA: 카테고리 id 중복 없음", () => {
  const ids = TUNING_DATA.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("TUNING_DATA: 카테고리마다 ko/en 라벨 + 악기 1개 이상", () => {
  for (const cat of TUNING_DATA) {
    assert.ok(cat.name.ko && cat.name.en, `${cat.id} name missing`);
    assert.ok(cat.instruments.length > 0, `${cat.id} has no instruments`);
  }
});

test("TUNING_DATA: 악기 id 전역 유일", () => {
  const ids: string[] = [];
  for (const cat of TUNING_DATA) {
    for (const inst of cat.instruments) {
      ids.push(inst.id);
    }
  }
  assert.equal(new Set(ids).size, ids.length, `중복 악기 id: ${ids.length} vs ${new Set(ids).size}`);
});

test("TUNING_DATA: 모든 string은 양수 freq + ko/en 라벨", () => {
  for (const cat of TUNING_DATA) {
    for (const inst of cat.instruments) {
      assert.ok(inst.strings.length > 0, `${inst.id} no strings`);
      for (const s of inst.strings) {
        assert.ok(s.freq > 0, `${inst.id} ${s.note} freq <= 0`);
        assert.ok(s.freq < 8000, `${inst.id} ${s.note} freq 비현실적: ${s.freq}`);
        assert.ok(s.note.length > 0, `${inst.id} note 비어있음`);
        assert.ok(s.label.ko && s.label.en, `${inst.id} ${s.note} label 누락`);
      }
    }
  }
});

test("TUNING_DATA: 기타(6현) 표준 튜닝 검증", () => {
  let g6: any = null;
  for (const cat of TUNING_DATA) {
    const found = cat.instruments.find((i) => i.id === "guitar6");
    if (found) g6 = found;
  }
  assert.ok(g6, "guitar6 카테고리 미존재");
  const expected = ["E", "A", "D", "G", "B", "E"];
  const actual = g6.strings.map((s: any) => s.note);
  assert.deepEqual(actual, expected);
  // 6번줄 E2 = 82.41Hz
  assert.equal(g6.strings[0].freq, 82.41);
  // 1번줄 E4 = 329.63Hz
  assert.equal(g6.strings[5].freq, 329.63);
});

test("TUNING_DATA: A4(440Hz)에 가까운 표준 음 존재", () => {
  let foundA4 = false;
  for (const cat of TUNING_DATA) {
    for (const inst of cat.instruments) {
      for (const s of inst.strings) {
        if (s.note === "A" && s.octave === 4 && Math.abs(s.freq - 440) < 0.5) {
          foundA4 = true;
        }
      }
    }
  }
  assert.equal(foundA4, true, "A4 표준 440Hz 음이 어디에도 없음");
});
