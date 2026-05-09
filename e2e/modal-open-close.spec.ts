/**
 * e2e/modal-open-close.spec.ts
 *
 * AnimatedModal / AnimatedSlideModal 기반 모달의 실제 열기/닫기 E2E 테스트.
 *
 * 검증 대상:
 *   1. 메인 메뉴 (AnimatedModal) — 열기 → 항목 표시 → backdrop 닫기
 *   2. 설정 모달 (AnimatedModal) — 메뉴에서 열기 → 내용 표시 → X 버튼 닫기
 *   3. MoreMenu 모달 (AnimatedModal) — 메뉴에서 열기 → 4개 항목 표시 → backdrop 닫기
 *
 * 실행:
 *   npx playwright test e2e/modal-open-close.spec.ts
 *
 * 전제:
 *   Expo 웹 앱이 http://localhost:8081 에서 실행 중이어야 함.
 *   (npm run expo:dev 또는 expo start --web --port 8081)
 *
 * 관련 파일:
 *   components/AnimatedModal.tsx
 *   components/SettingsModal.tsx   (testID="settings-close", testID="settings-username")
 *   components/MoreMenuModal.tsx   (testID="more-menu-*")
 *   app/index.tsx                  (testID="menu-button", testID="menu-more")
 */
import { test, expect, type Page } from "@playwright/test";

// AnimatedModal 닫힘 애니메이션 지속 시간 (ms).
// components/AnimatedModal.tsx HIDE_DURATION=300 + 여유 100ms
const ANIM_CLOSE_MS = 450;
// AnimatedModal 열림 애니메이션 지속 시간 (ms).
const ANIM_OPEN_MS = 350;

/** 온보딩 화면이 표시되면 건너뛴다. */
async function skipOnboardingIfPresent(page: Page) {
  const skipBtn = page.getByText(/건너뛰기|skip/i);
  const count = await skipBtn.count();
  if (count > 0) {
    await skipBtn.first().click();
    await page.waitForTimeout(300);
  }
}

/** 닫힌 모달 콘텐츠가 DOM 상에 있더라도 화면에 보이지 않는지 확인.
 *  AnimatedModal은 닫힌 후 visibility:hidden 상태로 DOM에 남는다.
 */
async function expectHidden(page: Page, selector: string) {
  const el = page.locator(selector);
  const visible = await el.isVisible().catch(() => false);
  expect(visible, `${selector} 는 닫힌 후 화면에 보이지 않아야 함`).toBe(false);
}

test.describe("AnimatedModal 열기/닫기", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // 앱 로딩 대기 — menu-button 이 나타날 때까지
    await page.locator('[data-testid="menu-button"]').waitFor({
      state: "visible",
      timeout: 20000,
    });
    await skipOnboardingIfPresent(page);
  });

  test("메인 메뉴: 열기 → 항목 표시 → backdrop 닫기", async ({ page }) => {
    const menuBtn = page.locator('[data-testid="menu-button"]');

    // 초기: 메뉴 항목은 보이지 않음
    await expectHidden(page, '[data-testid="menu-more"]');

    // 메뉴 열기
    await menuBtn.click();
    await page.waitForTimeout(ANIM_OPEN_MS);

    // 메뉴 항목 표시 확인
    await expect(
      page.locator('[data-testid="menu-more"]'),
      "menu-more 항목이 보여야 함",
    ).toBeVisible();
    await expect(
      page.getByText("설정").first(),
      "설정 항목이 보여야 함",
    ).toBeVisible();
    await expect(
      page.getByText("연습장").first(),
      "연습장 항목이 보여야 함",
    ).toBeVisible();

    // backdrop(오버레이) 클릭으로 닫기 — 화면 아래쪽 빈 공간
    await page.mouse.click(200, 650);
    await page.waitForTimeout(ANIM_CLOSE_MS);

    // 닫힘 확인
    await expectHidden(page, '[data-testid="menu-more"]');
  });

  test("설정 모달: 메뉴에서 열기 → 내용 표시 → X 버튼 닫기", async ({
    page,
  }) => {
    // 메뉴 열기
    await page.locator('[data-testid="menu-button"]').click();
    await page.waitForTimeout(ANIM_OPEN_MS);

    // 설정 메뉴 항목 클릭
    await page.getByText("설정").first().click();
    await page.waitForTimeout(ANIM_OPEN_MS);

    // 설정 모달 내용 확인
    await expect(
      page.locator('[data-testid="settings-close"]'),
      "settings-close 버튼이 보여야 함",
    ).toBeVisible();

    // 설정 모달 닫기
    await page.locator('[data-testid="settings-close"]').click();
    await page.waitForTimeout(ANIM_CLOSE_MS);

    // 닫힘 확인
    await expectHidden(page, '[data-testid="settings-close"]');
  });

  test("MoreMenu 모달: 메뉴에서 열기 → 4개 항목 표시 → backdrop 닫기", async ({
    page,
  }) => {
    // 메뉴 열기
    await page.locator('[data-testid="menu-button"]').click();
    await page.waitForTimeout(ANIM_OPEN_MS);

    // menu-more 클릭
    await page.locator('[data-testid="menu-more"]').click();
    await page.waitForTimeout(ANIM_OPEN_MS);

    // MoreMenu 4개 항목 표시 확인
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

    // backdrop 클릭으로 닫기 — 화면 위쪽 빈 공간
    await page.mouse.click(200, 80);
    await page.waitForTimeout(ANIM_CLOSE_MS);

    // 닫힘 확인
    await expectHidden(page, '[data-testid="more-menu-scheduled-start"]');
    await expectHidden(page, '[data-testid="more-menu-tempo-quiz"]');
  });
});
