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
 *   - 스크롤은 data-testid="signal-scroll" 컨테이너의 실제 scrollTop 변경으로 적용
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
 *   components/ModeSwitcherDial.tsx
 *     testID="mode-cycle-label"     — 모드 다이얼 열기
 */
import { test, expect, type Page } from "@playwright/test";

const VIEWPORT = { width: 375, height: 667 };
test.use({
  baseURL: process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : undefined,
});

/** 온보딩이 있으면 모두 건너뛴다 (최대 8회). */
async function skipOnboarding(page: Page) {
  for (let i = 0; i < 8; i++) {
    const skip = page.getByText(/건너뛰기|skip/i);
    const count = await skip.count();
    if (count === 0) break;
    await skip.first().click();
    await page.waitForTimeout(400);
  }
}

/**
 * 메뉴를 열고 Signal Generator 항목을 클릭해 모달을 띄운다.
 * signal-toggle 버튼이 DOM 에 붙을 때까지 대기한다.
 */
async function openSignalGenerator(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("viewportSize() is unavailable");

  await page.locator('[data-testid="mode-cycle-label"]').click();
  await page.waitForTimeout(400);
  await page.mouse.click(viewport.width / 2 - 58, 86);
  await page.waitForTimeout(300);
  await page.mouse.click(viewport.width / 2, viewport.height * 0.7);
  await page.waitForTimeout(600);

  const signalToggle = page.locator('[data-testid="signal-toggle"]');

  const signalMenuItem = page.getByRole("menuitem", {
    name: /signal generator|시그널 제너레이터/i,
  });
  await signalMenuItem.waitFor({ state: "visible", timeout: 10000 });
  await signalMenuItem.click();

  await signalToggle.waitFor({ state: "attached", timeout: 10000 });
}

/**
 * data-testid="signal-scroll" 컨테이너의 실제 스크롤 가능한 끝까지 이동해
 * 콘텐츠 높이에 따라 달라지는 고정 delta/wheel 이벤트에 의존하지 않는다.
 */
async function scrollSignalModal(page: Page) {
  const scrollContainer = page.locator('[data-testid="signal-scroll"]');
  await scrollContainer.waitFor({ state: "visible" });
  await scrollContainer.evaluate((element) => {
    const node = element as HTMLElement;
    node.scrollTop = node.scrollHeight;
    node.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
}

test.describe("SignalGeneratorModal 스크롤 (375×667 iPhone SE)", () => {
  test.use({ viewport: VIEWPORT });

  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .locator('[data-testid="mode-cycle-label"]')
      .waitFor({ state: "visible", timeout: 20000 });
    await skipOnboarding(page);
  });

  test("음·옥타브 선택과 기준음이 상세 패널 없이 바로 보인다", async ({
    page,
  }) => {
    await openSignalGenerator(page);
    await expect(page.getByTestId("signal-target-frequency")).toBeInViewport();
    await expect(page.getByTestId("signal-mic-toggle")).toBeInViewport();
    await expect(page.getByTestId("signal-details")).toHaveCount(0);
    await expect(page.getByTestId("signal-details-toggle")).toHaveCount(0);
    await expect(page.getByTestId("signal-target-note-picker")).toBeVisible();
    await expect(page.getByTestId("signal-target-octave-picker")).toBeVisible();

    await scrollSignalModal(page);
    await page.getByTestId("signal-toggle").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("signal-toggle")).toBeInViewport();
  });

  test("스크롤 후 재생 버튼을 클릭하면 정지 상태로 전환된다", async ({
    page,
  }) => {
    await openSignalGenerator(page);

    await scrollSignalModal(page);
    const toggleBtn = page.locator('[data-testid="signal-toggle"]');
    await expect(toggleBtn).toBeInViewport();

    await toggleBtn.click();

    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toBeEnabled();
    await expect(toggleBtn).toHaveAttribute("aria-label", /기준음 정지|Stop reference/);
    await toggleBtn.click();
    await expect(toggleBtn).toHaveAttribute("aria-label", /기준음 재생|Play reference/);
  });

  test("접지 않은 타겟을 버튼과 직접 입력으로 조절한다", async ({ page }) => {
    await openSignalGenerator(page);
    await page.getByTestId("signal-target-increase").click();
    await expect(page.getByTestId("signal-target-frequency")).toHaveText(/441\.0/);
    await page.getByTestId("signal-target-decrease").click();
    await expect(page.getByTestId("signal-target-frequency")).toHaveText(/440\.0/);
    await page.getByTestId("signal-target-edit").click();
    const input = page.getByTestId("signal-frequency-input");
    await input.fill("432");
    await input.press("Enter");
    await expect(page.getByTestId("signal-target-frequency")).toHaveText(/432\.0/);
    await expect(input).toHaveCount(0);
    await expect(page.getByTestId("signal-details")).toHaveCount(0);
    await page.getByTestId("signal-target-edit").click();
    await input.fill("435");
    await page.getByRole("button", { name: /^Apply$|^적용$/ }).click();
    await expect(page.getByTestId("signal-target-frequency")).toHaveText(/435\.0/);
  });

  test("타겟 숫자를 누르는 동안 기준음이 재생되고 떼면 멈춘다", async ({ page }) => {
    await openSignalGenerator(page);
    const target = page.getByTestId("signal-target-edit");
    const reference = page.getByTestId("signal-toggle");
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(reference).toHaveAttribute("aria-label", /Stop reference|기준음 정지/);
    await page.mouse.up();
    await expect(reference).toHaveAttribute("aria-label", /Play reference|기준음 재생/);
    await expect(page.getByTestId("signal-frequency-input")).toHaveCount(0);
  });

  test("오른쪽 음과 옥타브를 위아래 스크롤하면 타겟이 바뀐다", async ({ page }) => {
    await openSignalGenerator(page);
    const notePicker = page.getByTestId("signal-target-note-picker");
    await notePicker.getByRole("button", { name: /^(Note|음) G#$/ }).click();
    await expect(page.getByTestId("signal-target-frequency")).toHaveText(/415\.3/);
    const octavePicker = page.getByTestId("signal-target-octave-picker");
    await octavePicker.hover();
    await page.mouse.wheel(0, 32);
    await expect(page.getByTestId("signal-target-frequency")).not.toHaveText(/415\.3/);
    await expect(page.getByTestId("signal-details-toggle")).toHaveCount(0);
  });
});
