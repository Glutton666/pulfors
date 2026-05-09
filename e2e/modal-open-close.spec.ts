/**
 * e2e/modal-open-close.spec.ts
 *
 * AnimatedModal / AnimatedSlideModal 기반 모달의 실제 열기/닫기 E2E 테스트.
 *
 * 검증 대상:
 *   1. 메인 메뉴 (AnimatedModal) — 열기 → 항목 표시 → overlay 닫기
 *   2. 설정 모달 (AnimatedModal) — 메뉴에서 열기 → 내용 표시 → X 버튼 닫기
 *   3. MoreMenu 모달 (AnimatedModal) — 메뉴에서 열기 → 4개 항목 표시 → overlay 닫기
 *
 * 실행:
 *   npx playwright test e2e/modal-open-close.spec.ts
 *
 * 전제:
 *   Expo 웹 앱이 http://localhost:8081 에서 실행 중이어야 함.
 *
 * 안정성 설계:
 *   - 모든 어설션은 data-testid 기반 — 언어(locale) 독립적
 *   - backdrop 닫기는 data-testid="menu-overlay" / "more-menu-overlay" 사용
 *     (좌표 기반 클릭 없음)
 *   - 대기 시간은 실제 FADE_MS=150 기준 + 150ms 여유 = 300ms
 *
 * 관련 파일:
 *   components/AnimatedModal.tsx          FADE_MS=150
 *   components/SettingsModal.tsx          testID="settings-close", "settings-username"
 *   components/MoreMenuModal.tsx          testID="more-menu-overlay", "more-menu-*"
 *   app/index.tsx                         testID="menu-button", "menu-overlay", "menu-more"
 */
import { test, expect, type Page } from "@playwright/test";

// 실제 AnimatedModal FADE_MS=150 + 여유 150ms
const ANIM_MS = 300;

/** 온보딩이 있으면 모두 건너뛴다 (최대 5회 시도). */
async function skipOnboarding(page: Page) {
  for (let i = 0; i < 5; i++) {
    const skip = page
      .getByRole("button")
      .filter({ hasText: /건너뛰기|skip/i });
    const count = await skip.count();
    if (count === 0) break;
    await skip.first().click();
    await page.waitForTimeout(200);
  }
}

/** 닫힌 모달 요소가 화면에 보이지 않는지(visibility:hidden 또는 DOM 제거) 검증. */
async function expectNotVisible(page: Page, testId: string) {
  const el = page.locator(`[data-testid="${testId}"]`);
  const visible = await el.isVisible().catch(() => false);
  expect(visible, `[data-testid="${testId}"]가 닫힌 후 보이지 않아야 함`).toBe(
    false,
  );
}

test.describe("AnimatedModal 열기/닫기", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page
      .locator('[data-testid="menu-button"]')
      .waitFor({ state: "visible", timeout: 20000 });
    await skipOnboarding(page);
  });

  test("메인 메뉴: 열기 → 항목 표시 → overlay 닫기", async ({ page }) => {
    // 초기 상태: menu-more 보이지 않음
    await expectNotVisible(page, "menu-more");

    // 메뉴 열기
    await page.locator('[data-testid="menu-button"]').click();
    await page.waitForTimeout(ANIM_MS);

    // 메뉴 항목 testID로 확인 (언어 독립적)
    await expect(
      page.locator('[data-testid="menu-more"]'),
      "menu-more 항목이 보여야 함",
    ).toBeVisible();

    // menuitem role 요소들이 존재하는지 확인
    const menuItems = page.getByRole("menuitem");
    await expect(menuItems.first()).toBeVisible();

    // overlay(backdrop) 클릭으로 닫기
    await page.locator('[data-testid="menu-overlay"]').click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(ANIM_MS);

    // 닫힘 확인
    await expectNotVisible(page, "menu-more");
  });

  test("설정 모달: 메뉴에서 열기 → 내용 표시 → X 버튼 닫기", async ({
    page,
  }) => {
    // 초기: settings-close 보이지 않음
    await expectNotVisible(page, "settings-close");

    // 메뉴 열기
    await page.locator('[data-testid="menu-button"]').click();
    await page.waitForTimeout(ANIM_MS);

    // 설정 메뉴 항목 클릭 — accessibilityRole="menuitem" + accessibilityLabel="설정 열기"
    await page.getByRole("menuitem").first().click();
    await page.waitForTimeout(ANIM_MS);

    // 설정 모달 열림 확인 (testID 기반)
    await expect(
      page.locator('[data-testid="settings-close"]'),
      "settings-close 버튼이 보여야 함",
    ).toBeVisible();

    // 설정 모달 닫기
    await page.locator('[data-testid="settings-close"]').click();
    await page.waitForTimeout(ANIM_MS);

    // 닫힘 확인
    await expectNotVisible(page, "settings-close");
  });

  test("MoreMenu 모달: 메뉴에서 열기 → 4개 항목 표시 → overlay 닫기", async ({
    page,
  }) => {
    // 초기: more-menu-scheduled-start 보이지 않음
    await expectNotVisible(page, "more-menu-scheduled-start");

    // 메뉴 열기
    await page.locator('[data-testid="menu-button"]').click();
    await page.waitForTimeout(ANIM_MS);

    // menu-more 클릭
    await page.locator('[data-testid="menu-more"]').click();
    await page.waitForTimeout(ANIM_MS);

    // MoreMenu 4개 항목 표시 확인 (testID 기반, 언어 독립적)
    await expect(
      page.locator('[data-testid="more-menu-scheduled-start"]'),
      "more-menu-scheduled-start 가 보여야 함",
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="more-menu-fade-out"]'),
      "more-menu-fade-out 가 보여야 함",
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="more-menu-drum-kit"]'),
      "more-menu-drum-kit 가 보여야 함",
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="more-menu-tempo-quiz"]'),
      "more-menu-tempo-quiz 가 보여야 함",
    ).toBeVisible();

    // overlay 닫기 — testID 기반 (좌표 아님)
    await page.locator('[data-testid="more-menu-overlay"]').click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(ANIM_MS);

    // 닫힘 확인
    await expectNotVisible(page, "more-menu-scheduled-start");
    await expectNotVisible(page, "more-menu-tempo-quiz");
  });
});
