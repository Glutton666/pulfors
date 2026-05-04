/**
 * android-audio-focus 모듈 단위 테스트.
 *
 * 새 API:
 * - initAndroidFocusCallbacks(onLoss, onGain) — 콜백만 등록, 사운드 없음
 * - startAndroidFocusProbe()                  — 프로브 시작 (메트로놈 재생 시)
 * - stopAndroidFocusProbe()                   — 프로브 정지 (메트로놈 정지 시)
 *
 * expo-av 스텁의 MockSound._emit() 으로 isPlaying 상태 변화를 시뮬레이션한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "react-native";
import { Audio } from "expo-av";
import {
  initAndroidFocusCallbacks,
  startAndroidFocusProbe,
  stopAndroidFocusProbe,
  _resetAndroidFocusForTests,
} from "../lib/android-audio-focus";

// ── MockSound 타입 (expo-av 스텁과 일치) ──────────────────────────────────
interface MockSound {
  _statusCallback: ((s: Record<string, unknown>) => void) | null;
  _status: Record<string, unknown>;
  _emit(patch: Record<string, unknown>): void;
  unloadAsync(): Promise<void>;
}

// expo-av 스텁의 createAsync 를 패치해 마지막 생성된 Sound 를 캡처한다.
let lastSound: MockSound | null = null;
const origCreateAsync = (Audio.Sound as unknown as { createAsync: (
  src: unknown,
  opts: Record<string, unknown>,
  cb: (s: Record<string, unknown>) => void,
) => Promise<{ sound: MockSound; status: Record<string, unknown> }> }).createAsync;

(Audio.Sound as unknown as Record<string, unknown>).createAsync = async (
  src: unknown,
  opts: Record<string, unknown>,
  cb: (s: Record<string, unknown>) => void,
) => {
  const result = await origCreateAsync(src, opts, cb);
  lastSound = result.sound;
  return result;
};

/**
 * 각 테스트 전에 모듈 상태와 로컬 추적 변수를 초기화한다.
 */
function resetAll(os: "android" | "ios") {
  (Platform as unknown as Record<string, unknown>).OS = os;
  lastSound = null;
  _resetAndroidFocusForTests();
}

// ── 테스트 ──────────────────────────────────────────────────────────────────

test("iOS 에서 initAndroidFocusCallbacks 는 no-op 이다", () => {
  resetAll("ios");
  let called = false;
  initAndroidFocusCallbacks(() => { called = true; }, () => {});
  assert.equal(called, false, "iOS 에서 콜백을 즉시 호출하지 않아야 한다");
});

test("iOS 에서 startAndroidFocusProbe 는 Sound 를 생성하지 않는다", async () => {
  resetAll("ios");
  initAndroidFocusCallbacks(() => {}, () => {});
  await startAndroidFocusProbe();
  assert.equal(lastSound, null, "iOS 에서 Sound 를 생성하면 안 된다");
  await stopAndroidFocusProbe(); // no-op
});

test("Android 에서 startAndroidFocusProbe 가 Sound 를 생성한다", async () => {
  resetAll("android");
  initAndroidFocusCallbacks(() => {}, () => {});
  await startAndroidFocusProbe();
  assert.ok(lastSound !== null, "Sound 가 생성돼야 한다");
  await stopAndroidFocusProbe();
});

test("startAndroidFocusProbe 는 멱등하다 (이미 실행 중이면 no-op)", async () => {
  resetAll("android");
  initAndroidFocusCallbacks(() => {}, () => {});
  await startAndroidFocusProbe();
  const firstSound = lastSound;
  lastSound = null; // 리셋해서 두 번째 createAsync 호출 여부 확인

  await startAndroidFocusProbe(); // 두 번째 호출 → no-op
  assert.equal(lastSound, null, "이미 실행 중이면 Sound 를 다시 생성하지 않아야 한다");

  lastSound = firstSound; // 정리용으로 복원
  await stopAndroidFocusProbe();
});

test("isPlaying 이 예기치 않게 false 가 되면 onFocusLoss 가 호출된다", async () => {
  resetAll("android");
  let lossCount = 0;
  let gainCount = 0;
  initAndroidFocusCallbacks(() => lossCount++, () => gainCount++);
  await startAndroidFocusProbe();
  assert.ok(lastSound, "Sound 있어야 함");

  // 시스템이 오디오 포커스를 가져가 isPlaying 이 false 로 전환.
  lastSound!._emit({ isLoaded: true, isPlaying: false });
  assert.equal(lossCount, 1, "onFocusLoss 가 1회 호출돼야 한다");
  assert.equal(gainCount, 0);

  await stopAndroidFocusProbe();
});

test("isPlaying 이 다시 true 가 되면 onFocusGain 이 호출된다", async () => {
  resetAll("android");
  let lossCount = 0;
  let gainCount = 0;
  initAndroidFocusCallbacks(() => lossCount++, () => gainCount++);
  await startAndroidFocusProbe();

  lastSound!._emit({ isLoaded: true, isPlaying: false });
  assert.equal(lossCount, 1);

  lastSound!._emit({ isLoaded: true, isPlaying: true });
  assert.equal(gainCount, 1, "onFocusGain 이 1회 호출돼야 한다");

  await stopAndroidFocusProbe();
});

test("onFocusLoss 는 중복 호출되지 않는다 (멱등)", async () => {
  resetAll("android");
  let lossCount = 0;
  initAndroidFocusCallbacks(() => lossCount++, () => {});
  await startAndroidFocusProbe();

  lastSound!._emit({ isLoaded: true, isPlaying: false });
  lastSound!._emit({ isLoaded: true, isPlaying: false }); // 재전송
  assert.equal(lossCount, 1, "첫 번째 손실 이벤트만 lossCount 를 증가시켜야 한다");

  await stopAndroidFocusProbe();
});

test("onFocusGain 은 중복 호출되지 않는다 (멱등)", async () => {
  resetAll("android");
  let gainCount = 0;
  initAndroidFocusCallbacks(() => {}, () => gainCount++);
  await startAndroidFocusProbe();

  lastSound!._emit({ isLoaded: true, isPlaying: false });
  lastSound!._emit({ isLoaded: true, isPlaying: true });
  lastSound!._emit({ isLoaded: true, isPlaying: true }); // 중복
  assert.equal(gainCount, 1, "중복 gain 신호는 무시돼야 한다");

  await stopAndroidFocusProbe();
});

test("stopAndroidFocusProbe 후에는 포커스 이벤트가 콜백을 호출하지 않는다", async () => {
  resetAll("android");
  let lossCount = 0;
  initAndroidFocusCallbacks(() => lossCount++, () => {});
  await startAndroidFocusProbe();
  const soundRef = lastSound;

  await stopAndroidFocusProbe();

  // 정지 이후 isPlaying 변화는 무시되어야 한다.
  if (soundRef) {
    soundRef._emit({ isLoaded: true, isPlaying: false });
  }
  assert.equal(lossCount, 0, "프로브 정지 후 콜백이 호출되면 안 된다");
});

test("isLoaded: false 상태는 무시된다", async () => {
  resetAll("android");
  let lossCount = 0;
  initAndroidFocusCallbacks(() => lossCount++, () => {});
  await startAndroidFocusProbe();

  lastSound!._emit({ isLoaded: false, isPlaying: false });
  assert.equal(lossCount, 0, "isLoaded: false 이면 상태 변화를 무시해야 한다");

  await stopAndroidFocusProbe();
});

test("onFocusLoss 호출 후 프로브가 살아있어 onFocusGain 을 감지할 수 있다 (auto-resume 핵심 불변식)", async () => {
  // 이 테스트가 지키는 불변식:
  // notifyInterruptionBegin 이 stopAndroidFocusProbe 를 호출하면 안 된다.
  // 프로브를 멈추면 OS 가 포커스를 돌려줘도 onFocusGain 이 호출되지 않아
  // 메트로놈 auto-resume 이 불가능해진다.
  resetAll("android");
  let lossCount = 0;
  let gainCount = 0;
  // onFocusLoss 콜백이 stopAndroidFocusProbe 를 호출하는 상황을 시뮬레이션한다
  // (잘못된 audio-session 구현에서 발생할 수 있는 케이스).
  // 올바른 구현에서는 stopAndroidFocusProbe 호출이 없으므로 probe 가 살아있다.
  initAndroidFocusCallbacks(
    () => { lossCount++; /* 여기서 stopAndroidFocusProbe() 를 호출하면 안 된다 */ },
    () => { gainCount++; },
  );
  await startAndroidFocusProbe();

  // 포커스 손실 → onFocusLoss 호출
  lastSound!._emit({ isLoaded: true, isPlaying: false });
  assert.equal(lossCount, 1, "onFocusLoss 가 호출돼야 한다");

  // 프로브가 살아있어야 한다 (probe Sound 가 아직 있어야 함)
  assert.ok(lastSound, "포커스 손실 후에도 probe Sound 가 남아있어야 한다 (auto-resume 필수)");

  // OS 가 포커스를 돌려줌 → probe Sound 자동 재개 → onFocusGain 호출
  lastSound!._emit({ isLoaded: true, isPlaying: true });
  assert.equal(gainCount, 1, "probe 가 살아있으므로 onFocusGain 이 호출돼야 한다");

  await stopAndroidFocusProbe();
});

test("포커스 손실/회복 사이클이 여러 번 반복돼도 정상 동작한다", async () => {
  resetAll("android");
  let lossCount = 0;
  let gainCount = 0;
  initAndroidFocusCallbacks(() => lossCount++, () => gainCount++);
  await startAndroidFocusProbe();

  for (let i = 0; i < 3; i++) {
    lastSound!._emit({ isLoaded: true, isPlaying: false });
    lastSound!._emit({ isLoaded: true, isPlaying: true });
  }
  assert.equal(lossCount, 3, "3 사이클 loss");
  assert.equal(gainCount, 3, "3 사이클 gain");

  await stopAndroidFocusProbe();
  // 테스트 종료 후 Platform.OS 복구 (다른 테스트에 영향 없도록).
  (Platform as unknown as Record<string, unknown>).OS = "ios";
});
