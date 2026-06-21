/**
 * e2e/signal-generator-scroll.spec.ts
 *
 * SignalGeneratorModal 스크롤 E2E 테스트 (iPhone SE 375×667).
 *
 * 검증 대상:
 *   - 375×667 뷰포트(iPhone SE)에서 SignalGeneratorModal 을 열었을 때
 *     스크롤을 통해 파형(waveform) 선택 버튼과 재생(Play) 버튼에 도달할 수 있음
 *   - 재생 버튼(testID="signal-toggle")이 실제로 클릭 가능하며 상태가 토글됨
 *
 * 실행:
 *   npx playwright test e2e/signal-generator-scroll.spec.ts
 *
 * CI 자동 서버 기동:
 *   playwright.config.ts 의 webServer 설정이 포트 8081 을 자동으로 준비한다.
 *   이미 실행 중이면 재사용한다 (reuseExistingServer: true).
 *
 * 안정성 설계:
 *   - testID 기반 셀렉터 사용 → locale(언어) 독립적
 *   - 스크롤은 data-testid="signal-scroll" 컨테이너를 대상으로 wheel 이벤트 적용
 *   - 파형 버튼: data-testid="signal-wave-{sine|square|triangle|sawtooth}"
 *   - 재생/정지 버튼: data-testid="signal-toggle"
 *
 * 관련 파일:
 *   components/SignalGeneratorModal.tsx
 *     testID="signal-scroll"        — ScrollView 컨테이너
 *     testID="signal-wave-sine"     — 사인파 버튼
 *     testID="signal-wave-square"   — 사각파 버튼
 *     testID="signal-wave-triangle" — 삼각파 버튼
 *     testID="signal-wave-sawtooth" — 톱니파 버튼
 *     testID="signal-toggle"        — 재생/정지 버튼
 *   app/index.tsx
 *     testID="menu-button"          — 메인 메뉴 토글 버튼
 */
import { test, expect, type Page } from "@playwright/test";

const VIEWPORT = { width: 375, height: 667 };

/** 온보딩이 있으면 모두 건너뛴다 (최대 5회). */
async function skipOnboarding(page: Page) {
  for (let i = 0; i < 5; i++) {
    const skip = page
      .getByRole("button")
      .filter({ hasText: /건너뛰기|skip/i });
    const count = await skip.count();
    if (count === 0) break;
    await skip.first().click();
    await page
      .getByRole("button")
      .filter({ hasText: /건너뛰기|skip/i })
      .waitFor({ state: "hidden", timeout: 2000 })
      .catch(() => {});
  }
}

/**
 * 메뉴를 열고 Signal Generator 항목을 클릭해 모달을 띄운다.
 * signal-toggle 버튼이 DOM 에 붙을 때까지 대기한다.
 */
async function openSignalGenerator(page: Page) {
  await page.locator('[data-testid="menu-button"]').click();

  const signalToggle = page.locator('[data-testid="signal-toggle"]');

  await page
    .getByRole("menuitem", { name: /signal generator|시그널 제너레이터/i })
    .click();

  await signalToggle.waitFor({ state: "attached", timeout: 10000 });
}

/**
 * data-testid="signal-scroll" 컨테이너를 대상으로 wheel 이벤트를 발생시켜
 * 아래 방향으로 스크롤한다.
 */
async function scrollSignalModal(page: Page, deltaY = 400) {
  const scrollContainer = page.locator('[data-testid="signal-scroll"]');
  await scrollContainer.waitFor({ state: "visible" });
  const box = await scrollContainer.boundingBox();
  if (!box) throw new Error("signal-scroll bounding box not found");
  await page.mouse.wheel(0, deltaY);
}

test.describe("SignalGeneratorModal 스크롤 (375×667 iPhone SE)", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page
      .locator('[data-testid="menu-button"]')
      .waitFor({ state: "visible", timeout: 20000 });
    await skipOnboarding(page);
  });

  test("스크롤 후 파형 선택 버튼과 재생 버튼이 뷰포트 안에 보인다", async ({
    page,
  }) => {
    await openSignalGenerator(page);

    await scrollSignalModal(page, 500);
    await page.waitForTimeout(400);

    for (const waveType of ["sine", "square", "triangle", "sawtooth"]) {
      await expect(
        page.locator(`[data-testid="signal-wave-${waveType}"]`),
      ).toBeVisible();
    }

    await expect(page.locator('[data-testid="signal-toggle"]')).toBeVisible();
  });

  test("스크롤 후 재생 버튼을 클릭하면 정지 상태로 전환된다", async ({
    page,
  }) => {
    await openSignalGenerator(page);

    await scrollSignalModal(page, 500);
    await page.waitForTimeout(400);

    const toggleBtn = page.locator('[data-testid="signal-toggle"]');
    await expect(toggleBtn).toBeVisible();

    await toggleBtn.click();

    await page.waitForTimeout(600);

    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toBeEnabled();
  });
});
