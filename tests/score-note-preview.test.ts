/**
 * score-note-preview.test.ts
 *
 * previewScoreNote (lib/score-audio.ts) 동작 회귀 테스트:
 *  1. MIDI 범위 유효성 검사 — 범위 밖(< 21, > 108)이면 발음하지 않음
 *  2. isPlaying 게이트 — ScoreCanvas PanResponder release 분기 로직 시뮬레이션
 *  3. pitchToMidi 연동 — 음계 → MIDI 변환이 올바른지 확인 (ScoreCanvas에서 결합해 사용)
 *
 * React Native 컴포넌트(ScoreCanvas)는 이 테스트 환경에서 렌더링할 수 없으므로,
 * 게이트 로직을 순수 함수로 추출해 테스트한다.
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "react-native";

// ── Mock AudioContext ────────────────────────────────────────────────────────
// audio-renderer.ts의 getSharedAudioContext()는 globalThis.AudioContext가
// 존재할 때 새 인스턴스를 만든다.
// previewScoreNote(web 경로)가 오실레이터를 생성하는지 여부로 발음 시도를 추적한다.

let oscillatorCount = 0;

(globalThis as any).AudioContext = class MockAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};

  createOscillator() {
    oscillatorCount++;
    return {
      type: "sine",
      frequency: { value: 0 },
      connect() {},
      start() {},
      stop() {},
      disconnect() {},
    };
  }

  createGain() {
    return {
      gain: {
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        cancelScheduledValues() {},
        value: 0,
      },
      connect() {},
      disconnect() {},
    };
  }

  resume() {
    return Promise.resolve();
  }
};

// Platform.OS를 "web"으로 설정 — AudioContext(오실레이터) 경로를 사용하게 해
// 발음 시도를 직접 추적할 수 있도록 한다.
(Platform as unknown as Record<string, unknown>).OS = "web";

// score-audio 임포트는 위 전역 설정 이후에 이루어지므로 sharedAudioCtx가
// null인 상태에서 첫 발음 시 MockAudioContext를 사용한다.
import { previewScoreNote } from "../lib/score-audio";

// ── 1. MIDI 범위 유효성 검사 ─────────────────────────────────────────────────

describe("previewScoreNote — MIDI 범위 유효성 검사", () => {
  beforeEach(() => {
    oscillatorCount = 0;
  });

  test("MIDI 20 (하한 미만) → 발음하지 않음", () => {
    previewScoreNote(20);
    assert.equal(oscillatorCount, 0, "MIDI 20은 허용 범위(21~108) 밖이므로 오실레이터가 생성되면 안 됨");
  });

  test("MIDI 0 → 발음하지 않음", () => {
    previewScoreNote(0);
    assert.equal(oscillatorCount, 0);
  });

  test("MIDI 109 (상한 초과) → 발음하지 않음", () => {
    previewScoreNote(109);
    assert.equal(oscillatorCount, 0, "MIDI 109는 허용 범위(21~108) 밖이므로 오실레이터가 생성되면 안 됨");
  });

  test("MIDI 200 → 발음하지 않음", () => {
    previewScoreNote(200);
    assert.equal(oscillatorCount, 0);
  });

  test("MIDI 21 (허용 하한) → 발음 시도", () => {
    previewScoreNote(21);
    assert.equal(oscillatorCount, 1, "MIDI 21은 허용 하한이므로 오실레이터가 생성되어야 함");
  });

  test("MIDI 108 (허용 상한) → 발음 시도", () => {
    previewScoreNote(108);
    assert.equal(oscillatorCount, 1, "MIDI 108은 허용 상한이므로 오실레이터가 생성되어야 함");
  });

  test("MIDI 60 (C4) → 발음 시도", () => {
    previewScoreNote(60);
    assert.equal(oscillatorCount, 1);
  });

  test("연속 두 번 호출 → 각각 발음", () => {
    previewScoreNote(60);
    previewScoreNote(72);
    assert.equal(oscillatorCount, 2, "유효 MIDI 두 번 호출 시 오실레이터가 두 개 생성되어야 함");
  });

  test("유효·무효 혼합 → 유효한 것만 발음", () => {
    previewScoreNote(20);  // 무효
    previewScoreNote(60);  // 유효
    previewScoreNote(109); // 무효
    previewScoreNote(72);  // 유효
    assert.equal(oscillatorCount, 2, "유효 MIDI 2개만 오실레이터를 생성해야 함");
  });
});

// ── 2. isPlaying 게이트 (ScoreCanvas 로직 시뮬레이션) ───────────────────────
//
// ScoreCanvas.tsx PanResponder release의 실제 코드:
//   if (!isPlayingRef.current) {
//     previewScoreNote(pitchToMidi(info.pitch));
//   }
//
// React Native 컴포넌트는 이 환경에서 렌더링할 수 없으므로,
// 동일한 조건 분기를 순수 함수로 추출해 게이트 동작을 검증한다.

describe("previewScoreNote — isPlaying 게이트 (ScoreCanvas 분기 시뮬레이션)", () => {
  /**
   * ScoreCanvas PanResponder release의 미리 듣기 분기를 순수 함수로 추출.
   * previewFn에 스파이 함수를 주입해 호출 여부를 검증한다.
   */
  function simulateNoteRelease(
    isPlaying: boolean,
    midi: number,
    previewFn: (m: number) => void,
  ): void {
    if (!isPlaying) {
      previewFn(midi);
    }
  }

  test("isPlaying=false → previewScoreNote 호출됨", () => {
    let callCount = 0;
    let receivedMidi: number | null = null;
    const spy = (m: number) => {
      callCount++;
      receivedMidi = m;
    };

    simulateNoteRelease(false, 60, spy);

    assert.equal(callCount, 1, "재생 중이 아닐 때 미리 듣기가 호출되어야 함");
    assert.equal(receivedMidi, 60, "올바른 MIDI 번호가 전달되어야 함");
  });

  test("isPlaying=true → previewScoreNote 호출되지 않음", () => {
    let callCount = 0;
    const spy = (_m: number) => { callCount++; };

    simulateNoteRelease(true, 60, spy);

    assert.equal(callCount, 0, "재생 중일 때 미리 듣기가 호출되면 안 됨");
  });

  test("isPlaying 전환: false→true→false 순서대로 게이트 작동", () => {
    const calls: number[] = [];
    const spy = (m: number) => calls.push(m);

    simulateNoteRelease(false, 60, spy);  // 호출됨
    simulateNoteRelease(true, 64, spy);   // 억제됨
    simulateNoteRelease(false, 67, spy);  // 호출됨

    assert.deepEqual(calls, [60, 67], "isPlaying=false일 때만 호출되어야 함");
  });

  test("isPlaying=false → 여러 MIDI 번호가 각각 정확히 전달됨", () => {
    const calls: number[] = [];
    const spy = (m: number) => calls.push(m);

    simulateNoteRelease(false, 48, spy);
    simulateNoteRelease(false, 72, spy);
    simulateNoteRelease(false, 84, spy);

    assert.deepEqual(calls, [48, 72, 84]);
  });
});

// ── 3. pitchToMidi 연동 검증 ─────────────────────────────────────────────────
//
// ScoreCanvas에서 previewScoreNote(pitchToMidi(info.pitch))로 호출된다.
// pitchToMidi가 올바른 MIDI 번호를 반환하는지 확인한다.
// 이 앱의 octave 기준: C4 = 4*12 + 0 = 48 (음악적 "middle C")

describe("pitchToMidi — 음계 → MIDI 변환 (score-audio 연동)", () => {
  const { pitchToMidi } = require("../lib/score-layout");

  test("C4 (middle C) → MIDI 48", () => {
    const midi = pitchToMidi({ step: "C", octave: 4, accidental: "none" });
    assert.equal(midi, 48);
  });

  test("A4 → MIDI 57", () => {
    const midi = pitchToMidi({ step: "A", octave: 4, accidental: "none" });
    assert.equal(midi, 57);
  });

  test("G4 → MIDI 55", () => {
    const midi = pitchToMidi({ step: "G", octave: 4, accidental: "none" });
    assert.equal(midi, 55);
  });

  test("F#5 → MIDI 66", () => {
    const midi = pitchToMidi({ step: "F", octave: 5, accidental: "sharp" });
    assert.equal(midi, 66);
  });

  test("Bb3 → MIDI 46", () => {
    const midi = pitchToMidi({ step: "B", octave: 3, accidental: "flat" });
    assert.equal(midi, 46);
  });

  test("모든 결과가 MIDI 범위(21~108) 내의 일반 음표에 대해 유효", () => {
    const typicalPitches = [
      { step: "E", octave: 4, accidental: "none" },   // 높은음자리 최저선 E4
      { step: "F", octave: 5, accidental: "none" },   // 높은음자리 최고선 F5
      { step: "G", octave: 2, accidental: "none" },   // 낮은음자리 최저선 G2
      { step: "A", octave: 3, accidental: "none" },   // 낮은음자리 최고선 A3
    ];
    for (const pitch of typicalPitches) {
      const midi = pitchToMidi(pitch);
      assert.ok(
        midi >= 21 && midi <= 108,
        `pitchToMidi(${pitch.step}${pitch.octave}) = ${midi} 이 MIDI 범위 밖임`,
      );
    }
  });
});
