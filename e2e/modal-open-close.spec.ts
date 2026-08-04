/**
 * e2e/modal-open-close.spec.ts
 *
 * AnimatedModal / AnimatedSlideModal 기반 모달의 실제 열기/닫기 E2E 테스트.
 *
 * 검증 대상:
 *   1. 메인 메뉴 (AnimatedModal) — 열기 → 항목 표시 → overlay 닫기
 *   2. 설정 모달 (AnimatedModal) — 메뉴에서 열기 → 내용 표시 → X 버튼 닫기
 *   3. 메인 메뉴 → 음원 분리 항목 표시 → 음원 분리 모달 열기/닫기
 *
 * 실행:
 *   npx playwright test e2e/modal-open-close.spec.ts
 *
 * CI 자동 서버 기동:
 *   playwright.config.ts의 webServer 설정이 포트 8081을 자동으로 준비한다.
 *   이미 실행 중이면 재사용한다 (reuseExistingServer: true).
 *
 * 안정성 설계:
 *   - 모든 어설션은 data-testid 기반 → locale(언어) 독립적
 *   - 메인 메뉴는 전체 화면이라 backdrop 이 없다 — 다이얼로 모드 전환해 닫는다
 *     (좌표 클릭 없음)
 *   - 애니메이션 완료는 waitFor(state:"hidden"|"visible")로 조건부 대기
 *     (fixed sleep 최소화)
 *
 * 관련 파일:
 *   components/AnimatedModal.tsx          FADE_MS=150
 *   components/SettingsModal.tsx          testID="settings-close"
 *   components/MenuScreen.tsx             testID="menu-stemSep"
 *   components/StemSeparationModal.tsx    testID="stem-sep-close"
 *   components/MetronomeScreenUI.tsx      testID="mode-cycle-label", "menu-overlay"
 *   components/MenuScreen.tsx             testID="menu-stemSep"
 */
import { test, expect, type Page } from "@playwright/test";

/** 온보딩이 있으면 모두 건너뛴다 (최대 5회). */
/**
 * 온보딩이 있으면 모두 건너뛴다.
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
 * 상단 모드 다이얼로 메인 메뉴를 연다.
 * ModeSwitcherDial 지오메트리 (hideHandle=true → top-center 고정):
 *   anchor=(winW/2, 0), centAng=90°, ANGLE_STEP=34°, ICON_R=104
 *   MODES=[beat,bar,score,note,practice,stage,menu] — beat 기준 menu 는 offset −1
 *     → deg = 90 − 34 = 56° → dx = cos·104 ≈ +58, dy = sin·104 ≈ +86
 *   아이콘 탭(≤52px)으로 선택 후, 팬 밖 오버레이 탭으로 확정한다.
 */
async function openMainMenu(page: Page) {
  const vp = page.viewportSize();
  if (!vp) throw new Error("viewportSize() 가 null — playwright 설정 확인");
  await page.locator('[data-testid="mode-cycle-label"]').click();
  await page.waitForTimeout(400);
  await page.mouse.click(vp.width / 2 + 58, 86);
  await page.waitForTimeout(300);
  await page.mouse.click(vp.width / 2, vp.height * 0.7);
  await page.waitForTimeout(600);
}

test.describe("AnimatedModal 열기/닫기", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // 앱이 완전히 로딩될 때까지 상단 모드 레이블 대기
    await page
      .locator('[data-testid="mode-cycle-label"]')
      .waitFor({ state: "visible", timeout: 20000 });
    await skipOnboarding(page);
  });

  test("메인 메뉴: 열기 → 항목 표시 → 다이얼로 비트 모드 복귀", async ({ page }) => {
    const menuStemSep = page.locator('[data-testid="menu-stemSep"]');

    // 초기 상태: menu-stemSep 숨겨짐
    await expect(menuStemSep).toBeHidden();

    // 메뉴 열기
    await openMainMenu(page);

    // menu-stemSep이 visible 상태로 전환될 때까지 조건부 대기
    await expect(menuStemSep).toBeVisible();

    // menuitem role 요소가 하나 이상 존재하는지 확인 (언어 독립적)
    await expect(page.getByRole("menuitem").first()).toBeVisible();

    // 메뉴는 전체 화면(오버레이 없음) — 헤더 탭으로 다이얼을 열어 비트 모드로 복귀한다.
    // menu(idx 6) 기준 beat 는 offset +1 → deg = 90 + 34 = 124° → dx ≈ −58, dy ≈ +86
    const vp = page.viewportSize()!;
    await page.getByText(/^메뉴$|^Menu$/i).first().click();
    await page.waitForTimeout(400);
    await page.mouse.click(vp.width / 2 - 58, 86);
    await page.waitForTimeout(300);
    await page.mouse.click(vp.width / 2, vp.height * 0.7);

    // menu-stemSep이 hidden 상태로 전환될 때까지 조건부 대기
    await expect(menuStemSep).toBeHidden();
  });

  test("설정 모달: 메뉴에서 열기 → 내용 표시 → X 버튼 닫기", async ({
    page,
  }) => {
    const settingsClose = page.locator('[data-testid="settings-close"]');

    // 초기 상태: settings-close 숨겨짐
    await expect(settingsClose).toBeHidden();

    // 메뉴 열기
    await openMainMenu(page);

    // menuitem 첫 번째 항목(설정) 대기 후 클릭
    const firstMenuItem = page.getByRole("menuitem").first();
    await expect(firstMenuItem).toBeVisible();
    await firstMenuItem.click();

    // settings-close가 visible 상태로 전환될 때까지 조건부 대기
    await expect(settingsClose).toBeVisible();

    // X 버튼으로 닫기
    await settingsClose.click();

    // settings-close가 hidden 상태로 전환될 때까지 조건부 대기
    await expect(settingsClose).toBeHidden();
  });

  test("메인 메뉴: 음원 분리 항목 → 모달 열기 → 닫기", async ({
    page,
  }) => {
    const stemSepItem = page.locator('[data-testid="menu-stemSep"]');
    const stemSepClose = page.locator('[data-testid="stem-sep-close"]');

    // 초기 상태: 항목 숨겨짐
    await expect(stemSepItem).toBeHidden();

    // 메뉴 열기
    await openMainMenu(page);

    // 음원 분리 항목 대기 후 클릭
    await expect(stemSepItem).toBeVisible();
    await stemSepItem.click();

    // 음원 분리 모달이 열릴 때까지 대기
    await expect(stemSepClose).toBeVisible();

    // 닫기 → 메뉴로 복귀
    await stemSepClose.click();
    await expect(stemSepClose).toBeHidden();
  });
});
