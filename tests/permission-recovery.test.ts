import { test } from "node:test";
import assert from "node:assert/strict";

import {
  tryRecoverPermissionActions,
  hasAnyPendingPermissionAction,
  clearPendingPermissionAction,
  _resetPendingPermissionsForTest,
  _setPermissionRequestImplForTest,
  ensurePermission,
  type PermissionResult,
  type PermissionKind,
} from "../lib/permissions";
import { createT } from "../lib/i18n";

// react-native stub은 Alert가 없으므로 ensurePermission의 deny 경로에서
// Alert.alert 호출이 실패할 수 있다. 테스트에서는 showAlertOnDeny=false로
// 호출해 알림 분기를 피한다.

function makeRequest(plan: PermissionResult[]): (k: PermissionKind) => Promise<PermissionResult> {
  let i = 0;
  return async () => {
    const next = plan[Math.min(i, plan.length - 1)];
    i += 1;
    return next;
  };
}

test("거부(canAskAgain=false) 후 pendingAction 등록되고 다음 active에서 권한 허용 시 액션 재실행", async () => {
  _resetPendingPermissionsForTest();
  let runCount = 0;
  // 1차: 거부 + 더 묻지 않음 (설정에서만 켤 수 있음)
  _setPermissionRequestImplForTest(makeRequest([{ granted: false, canAskAgain: false }]));
  const t = createT("ko");
  const ok1 = await ensurePermission("mic", t, {
    showAlertOnDeny: false,
    pendingAction: () => { runCount += 1; },
  });
  assert.equal(ok1, false);
  assert.equal(hasAnyPendingPermissionAction(), true);

  // 사용자가 설정에서 권한을 켜고 복귀: 다음 probe는 granted
  _setPermissionRequestImplForTest(makeRequest([{ granted: true, canAskAgain: true }]));
  const events = await tryRecoverPermissionActions();
  assert.deepEqual(events, [{ kind: "mic", status: "recovered" }]);
  assert.equal(runCount, 1);
  assert.equal(hasAnyPendingPermissionAction(), false);

  _setPermissionRequestImplForTest(null);
});

test("두 번 연속 거부되면 pending이 abandoned로 정리되고 더 이상 재시도 안함", async () => {
  _resetPendingPermissionsForTest();
  let runCount = 0;
  _setPermissionRequestImplForTest(makeRequest([{ granted: false, canAskAgain: false }]));
  const t = createT("ko");
  await ensurePermission("photo", t, {
    showAlertOnDeny: false,
    pendingAction: () => { runCount += 1; },
  });
  assert.equal(hasAnyPendingPermissionAction(), true);

  // 첫 번째 복귀 probe: 여전히 거부 → still-denied
  _setPermissionRequestImplForTest(makeRequest([{ granted: false, canAskAgain: false }]));
  let events = await tryRecoverPermissionActions();
  assert.deepEqual(events, [{ kind: "photo", status: "still-denied" }]);
  assert.equal(hasAnyPendingPermissionAction(), true);

  // 두 번째 복귀 probe: 또 거부 → abandoned, 액션 미실행
  events = await tryRecoverPermissionActions();
  assert.deepEqual(events, [{ kind: "photo", status: "abandoned" }]);
  assert.equal(runCount, 0);
  assert.equal(hasAnyPendingPermissionAction(), false);

  // 추가 호출은 빈 결과
  events = await tryRecoverPermissionActions();
  assert.deepEqual(events, []);

  _setPermissionRequestImplForTest(null);
});

test("canAskAgain=true 거부는 pending 등록하지 않음 (재프롬프트 가능 경로)", async () => {
  _resetPendingPermissionsForTest();
  _setPermissionRequestImplForTest(makeRequest([{ granted: false, canAskAgain: true }]));
  const t = createT("ko");
  await ensurePermission("mic", t, {
    showAlertOnDeny: false,
    pendingAction: () => {},
  });
  assert.equal(hasAnyPendingPermissionAction(), false);
  _setPermissionRequestImplForTest(null);
});

test("권한 허용 시 기존 pending이 정리됨", async () => {
  _resetPendingPermissionsForTest();
  _setPermissionRequestImplForTest(makeRequest([{ granted: false, canAskAgain: false }]));
  const t = createT("ko");
  await ensurePermission("mic", t, {
    showAlertOnDeny: false,
    pendingAction: () => {},
  });
  assert.equal(hasAnyPendingPermissionAction(), true);

  _setPermissionRequestImplForTest(makeRequest([{ granted: true, canAskAgain: true }]));
  const ok = await ensurePermission("mic", t, { showAlertOnDeny: false });
  assert.equal(ok, true);
  assert.equal(hasAnyPendingPermissionAction(), false);
  _setPermissionRequestImplForTest(null);
});

test("showAlertOnDeny=true + canAskAgain=false: 알림 표시 단계에서는 pending 미등록", async () => {
  // ko 번역 + react-native 스텁의 Alert 미존재로 인해, 알림 분기는 try/catch에 잡혀
  // pending 등록 없이 종료된다. 즉, 사용자가 명시적으로 "설정 열기"를 누르지 않는
  // 한 pending이 남지 않는다(취소 시 stale 방지).
  _resetPendingPermissionsForTest();
  _setPermissionRequestImplForTest(makeRequest([{ granted: false, canAskAgain: false }]));
  const t = createT("ko");
  await ensurePermission("mic", t, {
    pendingAction: () => {},
  });
  assert.equal(hasAnyPendingPermissionAction(), false);
  _setPermissionRequestImplForTest(null);
});

test("clearPendingPermissionAction은 즉시 pending 해제", async () => {
  _resetPendingPermissionsForTest();
  _setPermissionRequestImplForTest(makeRequest([{ granted: false, canAskAgain: false }]));
  const t = createT("ko");
  await ensurePermission("mic", t, {
    showAlertOnDeny: false,
    pendingAction: () => {},
  });
  assert.equal(hasAnyPendingPermissionAction(), true);
  clearPendingPermissionAction("mic");
  assert.equal(hasAnyPendingPermissionAction(), false);
  _setPermissionRequestImplForTest(null);
});

test("동시 호출되어도 액션은 1회만 실행 (재진입 락)", async () => {
  _resetPendingPermissionsForTest();
  let runCount = 0;
  _setPermissionRequestImplForTest(makeRequest([{ granted: false, canAskAgain: false }]));
  const t = createT("ko");
  await ensurePermission("mic", t, {
    showAlertOnDeny: false,
    pendingAction: () => { runCount += 1; },
  });

  // probe가 약간 지연되도록 하면 두 번째 호출이 진행 중인 promise를 받아야 한다
  let resolveProbe: ((v: PermissionResult) => void) | null = null;
  _setPermissionRequestImplForTest(() => new Promise<PermissionResult>((res) => { resolveProbe = res; }));

  const p1 = tryRecoverPermissionActions();
  const p2 = tryRecoverPermissionActions();
  resolveProbe!({ granted: true, canAskAgain: true });
  const [e1, e2] = await Promise.all([p1, p2]);
  assert.equal(runCount, 1);
  // 두 호출은 동일한 events 배열을 공유한다
  assert.deepEqual(e1, [{ kind: "mic", status: "recovered" }]);
  assert.deepEqual(e2, e1);
  _setPermissionRequestImplForTest(null);
});

test("TTL 초과한 pending은 probe 시 abandoned 처리", async () => {
  _resetPendingPermissionsForTest();
  _setPermissionRequestImplForTest(makeRequest([{ granted: false, canAskAgain: false }]));
  const t = createT("ko");
  let runCount = 0;
  await ensurePermission("photo", t, {
    showAlertOnDeny: false,
    pendingAction: () => { runCount += 1; },
  });
  // 6분 뒤 시뮬레이션
  const events = await tryRecoverPermissionActions(Date.now() + 6 * 60 * 1000);
  assert.deepEqual(events, [{ kind: "photo", status: "abandoned" }]);
  assert.equal(runCount, 0);
  assert.equal(hasAnyPendingPermissionAction(), false);
  _setPermissionRequestImplForTest(null);
});
