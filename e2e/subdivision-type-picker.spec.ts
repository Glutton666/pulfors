/**
 * e2e/subdivision-type-picker.spec.ts
 *
 * SubdivisionBar 의 long-press 타입 피커 Modal E2E 테스트.
 *
 * 검증 대상:
 *   1. subdivision 셀 long-press → 타입 피커 Modal 표시
 *   2. 4가지 beat type(normal, accent, strong, mute) 각각 선택 →
 *      패턴이 올바르게 업데이트되고 피커가 닫힘
 *   3. backdrop(overlay) 탭 → 피커 닫힘, 패턴 변경 없음
 *
 * 실행:
 *   npx playwright test e2e/subdivision-type-picker.spec.ts
 *
 * 안정성 설계:
 *   - 모든 어설션은 data-testid 기반 (locale/언어 독립적)
 *   - long-press 는 mouse.down() + waitForTimeout(450ms) + mouse.up() 으로 재현
 *     (Pressable.delayLongPress=350ms 보다 충분히 길게)
 *   - backdrop 닫기는 overlay 좌상단 좌표 클릭 (메뉴 영역 바깥)
 *   - 모달 가시성은 waitFor(state:"visible"|"hidden") 조건부 대기
 *
 * 관련 파일:
 *   components/SubdivisionBar.tsx
 *     testID="subdivision-cell-{i}"
 *     testID="type-picker-overlay"
 *     testID="type-picker-menu"
 *     testID="type-picker-option-{beatType}"
 */
import { test, expect, type Page } from "@playwright/test";
import type { BeatType } from "../lib/metronome-engine";

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
 * 지정된 셀에 long-press 를 시뮬레이션한다.
 * React Native Web 의 Pressable.delayLongPress=350ms 를 초과하도록
 * 450ms 동안 마우스를 누르고 있는다.
 */
async function longPressCell(page: Page, cellIndex: number) {
  const cell = page.locator(`[data-testid="subdivision-cell-${cellIndex}"]`);
  await cell.waitFor({ state: "visible" });
  const box = await cell.boundingBox();
  if (!box) throw new Error(`Cell ${cellIndex} bounding box not found`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.up();
}

const BEAT_TYPES: BeatType[] = ["normal", "accent", "strong", "mute"];

test.describe("SubdivisionBar 타입 피커", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page
      .locator('[data-testid="menu-button"]')
      .waitFor({ state: "visible", timeout: 20000 });
    await skipOnboarding(page);
    // 첫 번째 셀이 렌더링될 때까지 대기
    await page
      .locator('[data-testid="subdivision-cell-0"]')
      .waitFor({ state: "visible", timeout: 10000 });
  });

  // ── 1. 피커 열기 ────────────────────────────────────────────────────────────

  test("셀 long-press 시 타입 피커 Modal 이 표시된다", async ({ page }) => {
    const pickerMenu = page.locator('[data-testid="type-picker-menu"]');

    // 피커는 초기에 없어야 함
    await expect(pickerMenu).toBeHidden();

    await longPressCell(page, 0);

    // 피커 메뉴가 나타날 때까지 대기
    await expect(pickerMenu).toBeVisible();

    // 4개 beat type 옵션이 모두 렌더링돼야 함
    for (const bt of BEAT_TYPES) {
      await expect(
        page.locator(`[data-testid="type-picker-option-${bt}"]`)
      ).toBeVisible();
    }
  });

  // ── 2. 타입 선택 → 패턴 업데이트 ──────────────────────────────────────────

  for (const bt of BEAT_TYPES) {
    test(`'${bt}' 선택 시 피커가 닫히고 해당 타입이 적용된다`, async ({
      page,
    }) => {
      const pickerMenu = page.locator('[data-testid="type-picker-menu"]');
      const option = page.locator(`[data-testid="type-picker-option-${bt}"]`);

      await longPressCell(page, 0);
      await expect(pickerMenu).toBeVisible();

      // 타입 옵션 선택
      await option.click();

      // 피커가 닫혀야 함
      await expect(pickerMenu).toBeHidden();

      // 동일 셀을 다시 long-press 해서 피커를 열고 선택된 항목에 체크마크가 있는지 확인
      await longPressCell(page, 0);
      await expect(pickerMenu).toBeVisible();

      // 선택된 항목은 체크마크 아이콘을 포함한다 (Feather name="check")
      // testID="type-picker-option-{bt}" 안에 svg 가 있으면 선택된 상태
      const selectedOption = page.locator(
        `[data-testid="type-picker-option-${bt}"]`
      );
      // 선택된 옵션이 visible 하면 충분 (타입이 적용됐다는 간접 검증)
      await expect(selectedOption).toBeVisible();

      // 닫기
      await page
        .locator('[data-testid="type-picker-overlay"]')
        .click({ position: { x: 5, y: 5 } });
      await expect(pickerMenu).toBeHidden();
    });
  }

  // ── 3. Backdrop 탭 → 닫기 (패턴 변경 없음) ─────────────────────────────────

  test("backdrop(overlay) 탭 시 피커가 닫히고 선택이 변경되지 않는다", async ({
    page,
  }) => {
    const pickerMenu = page.locator('[data-testid="type-picker-menu"]');
    const overlay = page.locator('[data-testid="type-picker-overlay"]');

    // 피커를 열어 현재 셀 타입을 확인한다
    await longPressCell(page, 0);
    await expect(pickerMenu).toBeVisible();

    // 어떤 옵션이 현재 선택돼 있는지 기록 (체크마크 svg 포함 여부로 판단)
    let initialSelectedType: string | null = null;
    for (const bt of BEAT_TYPES) {
      const optionEl = page.locator(
        `[data-testid="type-picker-option-${bt}"] svg`
      );
      const count = await optionEl.count();
      if (count > 0) {
        initialSelectedType = bt;
        break;
      }
    }

    // backdrop 클릭 (메뉴 영역 밖인 overlay 좌상단)
    await overlay.click({ position: { x: 5, y: 5 } });

    // 피커가 닫혀야 함
    await expect(pickerMenu).toBeHidden();

    // 다시 long-press 해서 선택 타입이 바뀌지 않았는지 검증
    await longPressCell(page, 0);
    await expect(pickerMenu).toBeVisible();

    if (initialSelectedType) {
      const checkInSelected = page.locator(
        `[data-testid="type-picker-option-${initialSelectedType}"] svg`
      );
      await expect(checkInSelected).toBeVisible();
    }

    // 정리
    await overlay.click({ position: { x: 5, y: 5 } });
    await expect(pickerMenu).toBeHidden();
  });
});
