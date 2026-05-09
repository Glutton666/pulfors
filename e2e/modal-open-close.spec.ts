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
 * CI 자동 서버 기동:
 *   playwright.config.ts의 webServer 설정이 포트 8081을 자동으로 준비한다.
 *   이미 실행 중이면 재사용한다 (reuseExistingServer: true).
 *
 * 안정성 설계:
 *   - 모든 어설션은 data-testid 기반 → locale(언어) 독립적
 *   - backdrop 닫기는 data-testid="menu-overlay" / "more-menu-overlay" 사용
 *     (좌표 클릭 없음)
 *   - 애니메이션 완료는 waitFor(state:"hidden"|"visible")로 조건부 대기
 *     (fixed sleep 최소화)
 *
 * 관련 파일:
 *   components/AnimatedModal.tsx          FADE_MS=150
 *   components/SettingsModal.tsx          testID="settings-close"
 *   components/MoreMenuModal.tsx          testID="more-menu-overlay", "more-menu-*"
 *   app/index.tsx                         testID="menu-button", "menu-overlay", "menu-more"
 */
import { test, expect, type Page } from "@playwright/test";

/** 온보딩이 있으면 모두 건너뛴다 (최대 5회). */
async function skipOnboarding(page: Page) {
  for (let i = 0; i < 5; i++) {
    const skip = page
      .getByRole("button")
      .filter({ hasText: /건너뛰기|skip/i });
    const count = await skip.count();
    if (count === 0) break;
    await skip.first().click();
    // 다음 온보딩 페이지 전환 대기
    await page
      .getByRole("button")
      .filter({ hasText: /건너뛰기|skip/i })
      .waitFor({ state: "hidden", timeout: 2000 })
      .catch(() => {});
  }
}

test.describe("AnimatedModal 열기/닫기", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // 앱이 완전히 로딩될 때까지 menu-button 대기
    await page
      .locator('[data-testid="menu-button"]')
      .waitFor({ state: "visible", timeout: 20000 });
    await skipOnboarding(page);
  });

  test("메인 메뉴: 열기 → 항목 표시 → overlay 닫기", async ({ page }) => {
    const menuMore = page.locator('[data-testid="menu-more"]');
    const menuOverlay = page.locator('[data-testid="menu-overlay"]');

    // 초기 상태: menu-more 숨겨짐
    await expect(menuMore).toBeHidden();

    // 메뉴 열기
    await page.locator('[data-testid="menu-button"]').click();

    // menu-more가 visible 상태로 전환될 때까지 조건부 대기
    await expect(menuMore).toBeVisible();

    // menuitem role 요소가 하나 이상 존재하는지 확인 (언어 독립적)
    await expect(page.getByRole("menuitem").first()).toBeVisible();

    // overlay 클릭으로 닫기
    await menuOverlay.click({ position: { x: 10, y: 10 } });

    // menu-more가 hidden 상태로 전환될 때까지 조건부 대기
    await expect(menuMore).toBeHidden();
  });

  test("설정 모달: 메뉴에서 열기 → 내용 표시 → X 버튼 닫기", async ({
    page,
  }) => {
    const settingsClose = page.locator('[data-testid="settings-close"]');

    // 초기 상태: settings-close 숨겨짐
    await expect(settingsClose).toBeHidden();

    // 메뉴 열기
    await page.locator('[data-testid="menu-button"]').click();

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

  test("MoreMenu 모달: 메뉴에서 열기 → 4개 항목 표시 → overlay 닫기", async ({
    page,
  }) => {
    const scheduledStart = page.locator(
      '[data-testid="more-menu-scheduled-start"]',
    );
    const moreMenuOverlay = page.locator('[data-testid="more-menu-overlay"]');

    // 초기 상태: more-menu-scheduled-start 숨겨짐
    await expect(scheduledStart).toBeHidden();

    // 메뉴 열기
    await page.locator('[data-testid="menu-button"]').click();

    // menu-more 대기 후 클릭
    const menuMore = page.locator('[data-testid="menu-more"]');
    await expect(menuMore).toBeVisible();
    await menuMore.click();

    // MoreMenu 4개 항목이 visible 상태로 전환될 때까지 조건부 대기
    await expect(scheduledStart).toBeVisible();
    await expect(
      page.locator('[data-testid="more-menu-fade-out"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="more-menu-drum-kit"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="more-menu-tempo-quiz"]'),
    ).toBeVisible();

    // overlay 클릭으로 닫기 (시트 바깥 영역)
    await moreMenuOverlay.click({ position: { x: 10, y: 10 } });

    // MoreMenu 항목들이 hidden 상태로 전환될 때까지 조건부 대기
    await expect(scheduledStart).toBeHidden();
    await expect(
      page.locator('[data-testid="more-menu-tempo-quiz"]'),
    ).toBeHidden();
  });
});
