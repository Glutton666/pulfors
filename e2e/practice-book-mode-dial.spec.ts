import { expect, test, type Page } from "@playwright/test";

async function start(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("metronome_onboarding_done", "1");
    localStorage.setItem("metronome_onboarding_lang_done", "1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("mode-cycle-label")).toBeVisible({ timeout: 45_000 });
}

async function select(page: Page, direction: "ArrowLeft" | "ArrowRight", count: number) {
  for (let i = 0; i < count; i++) await page.keyboard.press(direction);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("mode-dial-fan")).toHaveCount(0);
}

test("opening, dismissing and confirming the practice-book dial preserves the book", async ({ page }) => {
  await start(page);
  await page.getByTestId("mode-cycle-label").click();
  await expect(page.getByTestId("mode-dial-fan")).toBeVisible();
  await select(page, "ArrowLeft", 2);
  const book = page.getByTestId("practice-book-screen");
  await expect(book).toBeVisible();
  // Detect a close/remount as well as a visibly incorrect destination.
  await book.evaluate((element) => element.setAttribute("data-preserved-book", "yes"));

  await page.getByTestId("practice-book-mode-dial").click();
  await expect(page.getByTestId("mode-dial-fan")).toBeVisible();
  await expect(book).toHaveAttribute("data-preserved-book", "yes");
  await expect(page.getByTestId("mode-dial-slot-practice").getByText(/연습장|Practice/i)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("mode-dial-fan")).toHaveCount(0);
  await expect(book).toHaveAttribute("data-preserved-book", "yes");

  await page.getByTestId("practice-book-mode-dial").click();
  await expect(page.getByTestId("mode-dial-fan")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("mode-dial-fan")).toHaveCount(0);
  // Confirmation is delayed by the fan's closing animation.
  await page.waitForTimeout(350);
  await expect(book).toHaveAttribute("data-preserved-book", "yes");

  await page.getByTestId("practice-book-mode-dial").click();
  await expect(page.getByTestId("mode-dial-fan")).toBeVisible();
  await select(page, "ArrowRight", 2);
  await expect(book).toHaveCount(0);
  await expect(page.getByTestId("mode-cycle-label")).toContainText(/비트|Beat/i);
});

test("touch opening the book dial retains practice selection and can select another mode", async ({ page }) => {
  await start(page);
  await page.getByTestId("mode-cycle-label").tap();
  await expect(page.getByTestId("mode-dial-fan")).toBeVisible();
  const viewport = page.viewportSize()!;
  await page.touchscreen.tap(viewport.width / 2 - 96, 39);
  await page.touchscreen.tap(viewport.width / 2, viewport.height * 0.7);
  await expect(page.getByTestId("practice-book-screen")).toBeVisible();

  await page.getByTestId("practice-book-mode-dial").tap();
  await expect(page.getByTestId("mode-dial-fan")).toBeVisible();
  await expect(page.getByTestId("practice-book-screen")).toBeVisible();
  await expect(page.getByTestId("mode-dial-slot-practice").getByText(/연습장|Practice/i)).toBeVisible();
  // From practice: +1 = menu, +2 = beat. Only an explicit choice exits.
  await page.touchscreen.tap(viewport.width / 2 + 96, 39);
  await page.touchscreen.tap(viewport.width / 2, viewport.height * 0.7);
  await expect(page.getByTestId("practice-book-screen")).toHaveCount(0);
  await expect(page.getByTestId("mode-cycle-label")).toContainText(/비트|Beat/i);
});
