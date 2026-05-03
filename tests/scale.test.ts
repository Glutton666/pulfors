import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scale,
  moderateScale,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  IS_TABLET,
  CONTENT_MAX_WIDTH,
} from "../lib/scale";

test("SCREEN_WIDTH/SCREEN_HEIGHT: stub 기본 375x812", () => {
  assert.equal(SCREEN_WIDTH, 375);
  assert.equal(SCREEN_HEIGHT, 812);
});

test("IS_TABLET: 375x812 → false (휴대폰 크기)", () => {
  assert.equal(IS_TABLET, false);
});

test("CONTENT_MAX_WIDTH: 휴대폰에서 undefined", () => {
  assert.equal(CONTENT_MAX_WIDTH, undefined);
});

test("scale: 375/375 = 1, 1.6 미만으로 클램프", () => {
  assert.equal(scale, 1);
});

test("moderateScale: factor=0.5 기본, scale=1이면 size 그대로", () => {
  assert.equal(moderateScale(20), 20);
  assert.equal(moderateScale(40, 0.3), 40);
});

test("moderateScale: 사이즈 0이면 0", () => {
  assert.equal(moderateScale(0), 0);
});
