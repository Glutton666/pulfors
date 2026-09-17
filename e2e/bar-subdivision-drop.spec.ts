import { expect, test, type Page } from "@playwright/test";

async function skipOnboarding(page: Page) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const skip = page.getByText(/건너뛰기|Skip/i);
    if ((await skip.count()) === 0) return;
    await skip.first().click();
    await page.waitForTimeout(250);
  }
}

async function enterBarMode(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("viewportSize() is unavailable");

  await page.locator('[data-testid="mode-cycle-label"]').click();
  await page.waitForTimeout(400);

  // The top-anchored dial opens on Beat. Bar is the next slot clockwise.
  await page.mouse.click(viewport.width / 2 + 58, 86);
  await page.waitForTimeout(300);
  await page.mouse.click(viewport.width / 2, viewport.height * 0.7);

  await page.locator('[data-testid="beat-indicator-bar-mode"]').waitFor({
    state: "visible",
    timeout: 10000,
  });
}

async function barDragGeometry(page: Page) {
  const subdivision = page.locator('[data-testid="subdivision-cells"]');
  const dropArea = page.locator('[data-testid="bar-mode-drop-area"]');
  const source = await subdivision.boundingBox();
  const target = await dropArea.boundingBox();
  if (!source || !target) throw new Error("Bar drag geometry is unavailable");

  return {
    subdivision,
    startX: source.x + source.width / 2,
    startY: source.y + source.height / 2,
    targetX: target.x + target.width / 2,
    targetY: target.y + target.height / 2,
    outsideY: target.y - 80,
  };
}

async function dragWithMouse(
  page: Page,
  destination: { x: number; y: number },
) {
  const geometry = await barDragGeometry(page);
  await page.mouse.move(geometry.startX, geometry.startY);
  await page.mouse.down();
  await page.mouse.move(geometry.startX, geometry.startY - 30, { steps: 3 });
  await page.mouse.move(destination.x, destination.y, { steps: 12 });
  await expect(page.locator('[data-testid="subdivision-drag-ghost"]')).toBeVisible();
  await page.mouse.up();
}

test.describe("Bar subdivision pattern drop", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .locator('[data-testid="mode-cycle-label"]')
      .waitFor({ state: "visible", timeout: 20000 });
    await skipOnboarding(page);
    await enterBarMode(page);
  });

  test("adds one new Bar with the configured pattern", async ({ page }) => {
    const rows = page.locator('[data-testid^="bar-row-"]');
    const before = await rows.count();
    const geometry = await barDragGeometry(page);

    // Configure two notes before dragging so the added row verifies the full
    // draft pattern, rather than merely proving that a row appeared.
    await page.mouse.move(geometry.startX, geometry.startY);
    await page.mouse.down();
    await page.mouse.move(geometry.startX + 40, geometry.startY, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator('[data-testid^="subdivision-cell-"]')).toHaveCount(2);

    await dragWithMouse(page, { x: geometry.targetX, y: geometry.targetY });
    await expect(rows).toHaveCount(before + 1);
    await expect(page.locator(`[data-testid="bar-cell-${before}-0"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="bar-cell-${before}-1"]`)).toBeVisible();
  });

  test("does not add a Bar when released outside the list", async ({ page }) => {
    const rows = page.locator('[data-testid^="bar-row-"]');
    const before = await rows.count();
    const geometry = await barDragGeometry(page);

    await dragWithMouse(page, { x: geometry.targetX, y: geometry.outsideY });

    await expect(rows).toHaveCount(before);
  });

  test("does not add a Bar after pointer cancellation", async ({ page }) => {
    const rows = page.locator('[data-testid^="bar-row-"]');
    const before = await rows.count();
    const geometry = await barDragGeometry(page);

    await page.mouse.move(geometry.startX, geometry.startY);
    await page.mouse.down();
    await page.mouse.move(geometry.startX, geometry.startY - 30, { steps: 3 });
    await page.mouse.move(geometry.targetX, geometry.targetY, { steps: 12 });
    await expect(page.locator('[data-testid="subdivision-drag-ghost"]')).toBeVisible();
    await page.evaluate(() => {
      document.dispatchEvent(new PointerEvent("pointercancel", {
        bubbles: true,
        pointerId: 1,
        pointerType: "mouse",
      }));
    });
    await page.mouse.up();

    await expect(rows).toHaveCount(before);
    await expect(page.locator('[data-testid="subdivision-drag-ghost"]')).toHaveCount(0);
  });

  test("adds a Bar through the web touch-pointer path", async ({ page }) => {
    const rows = page.locator('[data-testid^="bar-row-"]');
    const before = await rows.count();
    const geometry = await barDragGeometry(page);

    await geometry.subdivision.dispatchEvent("pointerdown", {
      bubbles: true,
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
      clientX: geometry.startX,
      clientY: geometry.startY,
    });
    await page.evaluate(({ startX, startY, targetX, targetY }) => {
      const dispatch = (type: string, x: number, y: number) => {
        document.dispatchEvent(new PointerEvent(type, {
          bubbles: true,
          pointerId: 7,
          pointerType: "touch",
          isPrimary: true,
          clientX: x,
          clientY: y,
        }));
      };
      dispatch("pointermove", startX, startY - 30);
      dispatch("pointermove", targetX, targetY);
      dispatch("pointerup", targetX, targetY);
    }, {
      startX: geometry.startX,
      startY: geometry.startY,
      targetX: geometry.targetX,
      targetY: geometry.targetY,
    });

    await expect(rows).toHaveCount(before + 1);
  });
});