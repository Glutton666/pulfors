/**
 * e2e/score-note-preview-setting.spec.ts
 *
 * 음표 입력 미리 듣기 설정 변경이 즉시 반영되는지 E2E 테스트.
 *
 * 검증 대상:
 *   1. 미리 듣기 ON  → 음표 입력 → 오디오 발음 (AudioContext.createOscillator 호출됨)
 *   2. 미리 듣기 OFF → 음표 입력 → 오디오 없음 (createOscillator 호출 안됨)
 *   3. 재생 중(isPlaying=true)에는 ON이어도 억제됨
 *
 * 실행:
 *   npx playwright test e2e/score-note-preview-setting.spec.ts
 *
 * 안정성 설계:
 *   - AudioContext.prototype.createOscillator 를 page.addInitScript() 로 패치해
 *     발음 시도 횟수를 window.__oscillatorCount 에 누적한다 (웹 전용 경로).
 *   - 모든 어설션은 data-testid 기반 (locale/언어 독립적)
 *   - 캔버스 클릭 Y 좌표:
 *       lineSpacing=13(web≥768px), sf=1.3
 *       B4(MIDI 71) 물리 Y ≈ (SCORE_ROW_MARGIN_TOP=16 + SCORE_STAFF_PADDING_TOP=24 + B4_staffY=20) × 1.3 ≈ 78px
 *   - 캔버스 클릭 X 좌표: canvas.width × 0.55 (헤더 영역 이후 1번째 마디 중앙)
 *
 * 관련 파일:
 *   components/ScoreCanvas.tsx       testID="score-canvas-overlay"
 *   components/ScoreEditorModals.tsx testID="score-toggle-note-preview", "score-symbol-settings-done"
 *   components/ScoreEditorScreen.tsx testID="score-editor-back", "score-editor-play", "score-editor-stop",
 *                                    "score-editor-more-menu"
 *   components/ScoreListScreen.tsx   testID="score-list-empty-new", "score-list-import"
 *   components/ScoreNewModal.tsx     testID="score-new-create"
 */

import { test, expect, type Page } from "@playwright/test";

// ── 상수 ─────────────────────────────────────────────────────────────────────

/**
 * B4(MIDI 71, 높은음자리표 가운데 선) 물리 Y 좌표 (캔버스 overlay 상단 기준).
 *
 * 계산 근거 (BASE_LINE_SPACING=10):
 *   lineSpacing = 13  (web 너비 ≥768px 기준)
 *   sf          = 1.3  (= lineSpacing / BASE_LINE_SPACING)
 *   SCORE_ROW_MARGIN_TOP    = 16  (logical)
 *   SCORE_STAFF_PADDING_TOP = 24  (logical)
 *   B4 staff y (treble)     = 20  (logical, STAFF_HEIGHT=40의 중앙 선)
 *   → physical = (16 + 24 + 20) × 1.3 ≈ 78 px
 */
const CANVAS_NOTE_Y = 78;

/**
 * 캔버스 너비 대비 클릭 X 비율.
 * 헤더(음자리표+박자표 ≈ 135 physical px) 이후 첫 마디 중앙을 겨냥한다.
 */
const CANVAS_NOTE_X_RATIO = 0.55;

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

/**
 * 온보딩이 있으면 모두 건너뛴다 (최대 8회).
 * 주의: 건너뛰기는 accessibilityRole 없는 Pressable+Text 이므로
 * getByRole("button") 이 아닌 getByText 로 찾아야 한다.
 */
async function skipOnboarding(page: Page) {
  for (let i = 0; i < 8; i++) {
    const skip = page.getByText(/건너뛰기|Skip/i);
    if ((await skip.count()) === 0) break;
    await skip.first().click();
    await page.waitForTimeout(400);
  }
}

/**
 * 메인 화면 → 모드 다이얼 → 메뉴 Lab → 악보 모드 → 새 악보 생성 → 악보 편집기.
 * 호출 후 score-editor-back 이 visible 상태가 보장된다.
 *
 * 다이얼 fan 지오메트리 (ModeSwitcherDial.tsx, hideHandle=true → top-center 고정):
 *   초기 비트 모드에서 menu 는 offset −1 → dx≈−58, dy≈+86.
 *   menu 를 선택한 뒤 바깥 영역을 탭해 확정하고, Lab 하위 메뉴에서 악보를 선택한다.
 */
async function navigateToScoreEditor(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("viewportSize() 가 null — playwright 설정 확인");
  const cx = viewport.width / 2;

  // 상단 중앙 모드 레이블 탭 → 팬 다이얼 열기
  await page.locator('[data-testid="mode-cycle-label"]').click();
  // 팬 오픈 애니메이션 대기
  await page.waitForTimeout(400);

  // menu(−1) 선택
  await page.mouse.click(cx - 58, 86);
  await page.waitForTimeout(300);

  // 팬 밖 오버레이 탭 → 메뉴 선택 확정
  await page.mouse.click(cx, viewport.height * 0.7);

  // Lab 하위 메뉴 → 악보 목록
  await page.locator('[data-testid="menu-lab"]').waitFor({ state: "visible" });
  await page.locator('[data-testid="menu-lab"]').click();
  await page.locator('[data-testid="menu-score"]').waitFor({ state: "visible" });
  await page.locator('[data-testid="menu-score"]').click();

  // 악보 목록이 열릴 때까지 대기 (score-list-import 는 목록 헤더에 항상 존재)
  await page
    .locator('[data-testid="score-list-import"]')
    .waitFor({ state: "visible", timeout: 10000 });

  // 새 악보 버튼 (목록 비어있을 때는 score-list-empty-new, 그 외엔 score-list-new)
  const emptyNew = page.locator('[data-testid="score-list-empty-new"]');
  const headerNew = page.locator('[data-testid="score-list-new"]');
  const newBtn = (await emptyNew.isVisible()) ? emptyNew : headerNew;
  await newBtn.click();

  // 새 악보 모달 → 생성
  await page
    .locator('[data-testid="score-new-create"]')
    .waitFor({ state: "visible", timeout: 8000 });
  await page.locator('[data-testid="score-new-create"]').click();

  // 편집기가 열릴 때까지 대기
  await page
    .locator('[data-testid="score-editor-back"]')
    .waitFor({ state: "visible", timeout: 10000 });

  // 4분음표 선택 — 팔레트에서 음길이를 골라야 캔버스 탭이 음표 입력으로 동작한다.
  await page.locator('[data-testid="score-palette-dur-quarter"]').click();
  await page.waitForTimeout(300);
}

/**
 * score-editor-more-menu → 악기 기호 설정 모달을 열어 미리 듣기 토글의
 * 현재 checked 값을 반환한다.
 * 모달은 열린 채로 반환된다 (호출자가 닫아야 함).
 */
async function openSymbolSettings(page: Page) {
  await page.locator('[data-testid="score-editor-more-menu"]').click();
  await page
    .locator('[data-testid="score-menu-symbol-settings"]')
    .waitFor({ state: "visible" });
  await page.locator('[data-testid="score-menu-symbol-settings"]').click();
  // 토글이 나타날 때까지 대기
  await page
    .locator('[data-testid="score-toggle-note-preview"]')
    .waitFor({ state: "visible" });
}

/** 악기 기호 설정 모달을 닫는다 (Done 버튼 클릭). */
async function closeSymbolSettings(page: Page) {
  await page.locator('[data-testid="score-symbol-settings-done"]').click();
  await page
    .locator('[data-testid="score-toggle-note-preview"]')
    .waitFor({ state: "hidden" });
}

/**
 * 미리 듣기 토글을 원하는 값으로 설정한다.
 * 설정 모달이 열린 상태에서 호출해야 한다.
 */
async function setNotePreview(page: Page, desiredOn: boolean) {
  const toggle = page.locator('[data-testid="score-toggle-note-preview"]');
  // React Native Web Switch: 래퍼 div 에는 aria-checked 가 없다.
  // 내부 <input type="checkbox"> 의 checked 프로퍼티로 상태를 읽는다.
  const current = await toggle.evaluate(
    (el) => (el.querySelector("input") as HTMLInputElement | null)?.checked ?? false,
  );
  if (current !== desiredOn) {
    await toggle.click();
    // 상태 반전 후 안정화 대기
    await page.waitForTimeout(200);
  }
}

/**
 * 악보 canvas overlay 위를 클릭해 음표 입력을 시도한다.
 * score-canvas-overlay 의 바운딩박스를 기반으로 B4 위치를 계산한다.
 *
 * @returns 클릭 직전의 oscillator 카운트
 */
async function clickCanvas(page: Page): Promise<number> {
  const overlay = page.locator('[data-testid="score-canvas-overlay"]');
  await overlay.waitFor({ state: "visible", timeout: 8000 });
  const box = await overlay.boundingBox();
  if (!box) throw new Error("score-canvas-overlay bounding box not found");

  const countBefore = await page.evaluate(
    () => (window as any).__oscillatorCount ?? 0,
  );

  // B4 (MIDI 71) 위치를 겨냥해 클릭
  await page.mouse.click(
    box.x + box.width * CANVAS_NOTE_X_RATIO,
    box.y + CANVAS_NOTE_Y,
  );

  // 오디오 스케줄링에 충분한 시간 부여
  await page.waitForTimeout(300);

  return countBefore;
}

/** 현재 oscillator 카운트를 반환한다. */
async function getOscillatorCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as any).__oscillatorCount ?? 0);
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

// NOTE(2026-08): '그 외' 메뉴가 제거되어 MoreMenu 경유 경로 대신
// 상단 모드 다이얼(mode-cycle-label → 팬 다이얼)로 악보 모드에 진입한다.
test.describe("음표 입력 미리 듣기 설정 E2E", () => {
  test.beforeEach(async ({ page }) => {
    // AudioContext.createOscillator 를 패치해 발음 시도 횟수를 추적한다.
    // previewScoreNote 웹 경로는 _playWebNote → getWebAudioContext().createOscillator() 를 사용한다.
    await page.addInitScript(() => {
      (window as any).__oscillatorCount = 0;
      const Ctx =
        (window as any).AudioContext ??
        (window as any).webkitAudioContext;
      if (Ctx) {
        const orig = Ctx.prototype.createOscillator;
        Ctx.prototype.createOscillator = function (
          this: AudioContext,
          ...args: unknown[]
        ) {
          (window as any).__oscillatorCount++;
          return orig.apply(this, args);
        };
      }
    });

    // Expo 웹 개발 서버의 load 이벤트는 열린 연결 때문에 끝나지 않을 수 있다.
    // 화면 준비는 아래 testID 대기로 확인한다.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .locator('[data-testid="mode-cycle-label"]')
      .waitFor({ state: "visible", timeout: 20000 });
    await skipOnboarding(page);
    await navigateToScoreEditor(page);
  });

  // ── 1. 미리 듣기 ON → 음표 입력 → 오디오 발음 ─────────────────────────────

  test("미리 듣기 ON 상태에서 음표 입력 시 AudioContext 오실레이터가 생성된다", async ({
    page,
  }) => {
    // 기본값이 ON이지만 명시적으로 확인 후 설정
    await openSymbolSettings(page);
    await setNotePreview(page, true);

    const toggle = page.locator('[data-testid="score-toggle-note-preview"]');
    expect(
      await toggle.evaluate(
        (el) => (el.querySelector("input") as HTMLInputElement | null)?.checked,
      ),
    ).toBe(true);

    await closeSymbolSettings(page);

    // 음표 입력 → 오실레이터가 생성되어야 함
    const countBefore = await clickCanvas(page);
    const countAfter = await getOscillatorCount(page);

    expect(
      countAfter,
      "미리 듣기 ON: 음표 클릭 후 createOscillator 가 호출되어야 한다",
    ).toBeGreaterThan(countBefore);
  });

  // ── 2. 미리 듣기 OFF → 음표 입력 → 오디오 없음 ───────────────────────────

  test("미리 듣기 OFF 상태에서 음표 입력 시 오디오가 발음되지 않는다", async ({
    page,
  }) => {
    // ON인 상태를 확인 후 먼저 ON으로 캔버스 클릭 → 유효 좌표 검증
    await openSymbolSettings(page);
    await setNotePreview(page, true);
    await closeSymbolSettings(page);

    const countAfterOn = (await clickCanvas(page)) + 1;
    const actualAfterOn = await getOscillatorCount(page);
    // ON 상태에서 오실레이터가 생성됐는지 확인 (캔버스 좌표 유효성 검증)
    expect(
      actualAfterOn,
      "캔버스 ON 클릭: 오실레이터가 생성되어야 캔버스 좌표가 유효함을 알 수 있다",
    ).toBeGreaterThanOrEqual(countAfterOn);

    // 이제 OFF로 전환
    await openSymbolSettings(page);
    await setNotePreview(page, false);

    const toggleOff = page.locator('[data-testid="score-toggle-note-preview"]');
    expect(
      await toggleOff.evaluate(
        (el) => (el.querySelector("input") as HTMLInputElement | null)?.checked,
      ),
    ).toBe(false);

    await closeSymbolSettings(page);

    // OFF 상태에서 음표 입력 → 오실레이터 증가 없어야 함
    const countBeforeOff = await clickCanvas(page);
    const countAfterOff = await getOscillatorCount(page);

    expect(
      countAfterOff,
      "미리 듣기 OFF: 음표 클릭 후 createOscillator 가 호출되면 안 된다",
    ).toBe(countBeforeOff);
  });

  // ── 3. 재생 중에는 ON이어도 억제됨 ────────────────────────────────────────

  test("재생 중(isPlaying=true)에는 미리 듣기 ON이어도 오디오가 억제된다", async ({
    page,
  }) => {
    // 미리 듣기 ON 확인
    await openSymbolSettings(page);
    await setNotePreview(page, true);
    await closeSymbolSettings(page);

    // ON 상태에서 먼저 클릭해 캔버스 좌표 유효성 확인
    const countBefore1 = await clickCanvas(page);
    const countAfter1 = await getOscillatorCount(page);
    expect(
      countAfter1,
      "재생 전 ON 클릭: 오실레이터가 생성되어야 좌표가 유효함을 알 수 있다",
    ).toBeGreaterThan(countBefore1);

    // 재생 시작
    const playBtn = page.locator('[data-testid="score-editor-play"]');
    await playBtn.waitFor({ state: "visible" });
    await playBtn.click();

    // isPlaying=true 반영까지 잠깐 대기 (상태 전파)
    await page.waitForTimeout(300);

    // 재생 중 음표 입력 → 오실레이터 증가 없어야 함
    const countBeforePlaying = await clickCanvas(page);
    const countAfterPlaying = await getOscillatorCount(page);

    expect(
      countAfterPlaying,
      "재생 중 ON: isPlaying 게이트가 createOscillator 호출을 억제해야 한다",
    ).toBe(countBeforePlaying);

    // 정리: 재생 중지
    const stopBtn = page.locator('[data-testid="score-editor-stop"]');
    if (await stopBtn.isVisible()) {
      await stopBtn.click();
    }
  });

  test("편집기의 X 버튼은 악보 모드를 닫고 실험실 메뉴로 돌아간다", async ({
    page,
  }) => {
    await page.locator('[data-testid="score-editor-close"]').click();

    await page
      .locator('[data-testid="score-editor-close"]')
      .waitFor({ state: "hidden", timeout: 8000 });
    await page
      .locator('[data-testid="score-list-import"]')
      .waitFor({ state: "hidden", timeout: 8000 });
    await page
      .locator('[data-testid="menu-lab"]')
      .waitFor({ state: "visible", timeout: 8000 });
    await page
      .locator('[data-testid="mode-cycle-label"]')
      .waitFor({ state: "hidden", timeout: 8000 });
  });
});
