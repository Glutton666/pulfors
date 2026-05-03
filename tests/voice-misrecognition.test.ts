// 메트로놈 클릭 사운드가 마이크에 유입되어 오인된 상황을 시뮬레이션하는
// 통합 단위 테스트. 가짜 SpeechRecognition으로 인식 결과 스트림을 흘려보내고,
// startVoiceRecognition → 필터 → parseVoiceCommand 까지의 전체 파이프라인이
// 오작동을 막으면서 정상 명령은 그대로 전달하는지 검증한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startVoiceRecognition } from "../lib/voice-recognition";
import { parseVoiceCommand } from "../lib/voice-commands";

class FakeRecognition {
  lang = "";
  interimResults = false;
  maxAlternatives = 0;
  continuous = false;
  onresult: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;
  start() {}
  stop() {}
  emit(transcript: string, confidence: number) {
    this.onresult?.({
      results: [
        Object.assign([{ transcript, confidence }], { length: 1 }),
      ],
    });
  }
}

function setupFakeSR(): { recs: FakeRecognition[]; restore: () => void } {
  const w = globalThis as any;
  if (typeof w.window === "undefined") w.window = w;
  const prevSR = w.window.SpeechRecognition;
  const recs: FakeRecognition[] = [];
  w.window.SpeechRecognition = function () {
    const r = new FakeRecognition();
    recs.push(r);
    return r;
  };
  const RN = require("react-native");
  const prevPlatform = RN.Platform.OS;
  RN.Platform.OS = "web";
  return {
    recs,
    restore: () => {
      w.window.SpeechRecognition = prevSR;
      RN.Platform.OS = prevPlatform;
    },
  };
}

test("오인 시나리오: 메트로놈 클릭 직후 'go'로 오인된 결과는 명령으로 실행되지 않는다", () => {
  const { recs, restore } = setupFakeSR();
  try {
    const commands: string[] = [];
    const filtered: string[] = [];
    const handle = startVoiceRecognition({
      lang: "en",
      onResult: (t) => {
        const cmd = parseVoiceCommand(t);
        commands.push(cmd.type);
      },
      onError: () => {},
      onEnd: () => {},
      clickBlackoutMs: 80,
      onResultFiltered: (reason) => filtered.push(reason),
    });
    assert.ok(handle);

    // 메트로놈 클릭이 발생했고 그 직후 마이크에 클릭 노이즈가 'go'(=play)로 오인되었다고 가정.
    handle!.noteClick(Date.now());
    recs[0].emit("go", 0.95);

    assert.deepEqual(commands, [], "blackout 윈도우 안의 결과는 파서로 전달되면 안됨");
    assert.equal(filtered[0], "click-blackout");
  } finally {
    restore();
  }
});

test("오인 시나리오: 신뢰도 낮은 'stop'은 차단되어 정지로 실행되지 않는다", () => {
  const { recs, restore } = setupFakeSR();
  try {
    const commands: string[] = [];
    const filtered: string[] = [];
    const handle = startVoiceRecognition({
      lang: "en",
      onResult: (t) => commands.push(parseVoiceCommand(t).type),
      onError: () => {},
      onEnd: () => {},
      onResultFiltered: (reason) => filtered.push(reason),
    });
    assert.ok(handle);

    // 클릭 사운드가 'stop'으로 오인되었지만 confidence가 매우 낮음.
    recs[0].emit("stop", 0.15);
    // 단일 음절 한국어 'go' 같은 짧은 오인.
    recs[0].emit("o", 0.9);

    assert.deepEqual(commands, []);
    assert.deepEqual(filtered, ["low-confidence", "too-short"]);
  } finally {
    restore();
  }
});

test("정상 시나리오: 클릭 윈도우 밖에서 발화한 'stop'은 정상 실행된다", () => {
  const { recs, restore } = setupFakeSR();
  try {
    const commands: string[] = [];
    const handle = startVoiceRecognition({
      lang: "en",
      onResult: (t) => commands.push(parseVoiceCommand(t).type),
      onError: () => {},
      onEnd: () => {},
      clickBlackoutMs: 80,
    });
    assert.ok(handle);

    // 사용자가 의도적으로 발화한 명령은 confidence가 충분하고
    // 직전 클릭과 시간 간격이 충분히 떨어져 있다고 가정.
    handle!.noteClick(Date.now() - 500);
    recs[0].emit("stop please", 0.92);

    assert.deepEqual(commands, ["stop"]);
  } finally {
    restore();
  }
});

test("오인 스트림: 연속 클릭 동안 모두 차단되고, 사용자 발화만 통과", () => {
  const { recs, restore } = setupFakeSR();
  try {
    const commands: string[] = [];
    const filtered: string[] = [];
    const handle = startVoiceRecognition({
      lang: "en",
      onResult: (t) => commands.push(parseVoiceCommand(t).type),
      onError: () => {},
      onEnd: () => {},
      clickBlackoutMs: 80,
      onResultFiltered: (reason) => filtered.push(reason),
    });
    assert.ok(handle);

    // 클릭 → 곧바로 'go' (오인)
    handle!.noteClick(Date.now());
    recs[0].emit("go", 0.9);
    // 곧바로 다음 클릭 → 'play' (오인)
    handle!.noteClick(Date.now());
    recs[0].emit("play", 0.9);
    // 한참 뒤 사용자가 의도적으로 'play' 발화 (충분히 떨어진 lastClick)
    handle!.noteClick(Date.now() - 1000);
    recs[0].emit("play start", 0.95);

    assert.deepEqual(commands, ["play"], "마지막 정상 발화만 명령으로 실행됨");
    assert.deepEqual(filtered, ["click-blackout", "click-blackout"]);
  } finally {
    restore();
  }
});

test("parseVoiceCommand 자체로는 짧은 오인 입력도 매치될 수 있어 필터가 필수임을 회귀로 박제", () => {
  // 이 테스트는 의도적으로 필터를 우회한 경우를 보여준다 — 'go' 단일 단어는
  // parseVoiceCommand만으로는 play로 매치된다. 따라서 startVoiceRecognition의
  // minTranscriptLength/clickBlackoutMs 필터가 끼지 않으면 오인으로 재생이
  // 시작될 수 있다 — 이 회귀가 실제로 차단되고 있는지 위 테스트들이 보장한다.
  assert.equal(parseVoiceCommand("go").type, "play");
  assert.equal(parseVoiceCommand("stop").type, "stop");
});
