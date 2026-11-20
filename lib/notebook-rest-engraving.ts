import type { StaffStamp } from "./staff-notebook";
import { ROW_HEIGHT, STAFF_GAP, STAFF_TOP } from "./staff-notebook-layout";

// Bravura SMuFL U+E4E3–E4E8 via VexFlow's bravura_glyphs.ts.
// Cubic commands use SVG control-point order; see assets/licenses/Bravura-OFL.txt.
const outlines = {
  "rest-whole": {
    width: 406, top: 13, bottom: -194,
    path: "M 406 -157 L 406 -24 C 406 -3 389 13 369 13 L 37 13 C 16 13 0 -3 0 -24 L 0 -157 C 0 -177 16 -194 37 -194 L 369 -194 C 389 -194 406 -177 406 -157 Z",
  },
  "rest-half": {
    width: 406, top: 204, bottom: -3,
    path: "M 406 35 L 406 167 C 406 189 389 204 369 204 L 37 204 C 16 204 0 189 0 167 L 0 35 C 0 14 16 -3 37 -3 L 369 -3 C 389 -3 406 14 406 35 Z",
  },
  "rest-quarter": {
    width: 389, top: 537, bottom: -540,
    path: "M 112 -55 C 135 -84 156 -111 174 -141 C 177 -147 183 -158 183 -161 C 183 -163 183 -166 181 -167 C 179 -173 173 -174 166 -174 C 160 -174 148 -171 143 -170 C 141 -170 138 -170 137 -170 L 125 -166 C 50 -166 1 -233 1 -304 C 1 -376 63 -446 168 -527 C 180 -536 194 -540 206 -540 C 216 -540 226 -537 228 -531 C 229 -527 230 -524 230 -521 C 230 -508 219 -497 207 -487 C 189 -487 173 -448 170 -435 C 166 -423 164 -410 164 -397 C 164 -338 194 -292 255 -292 C 297 -292 344 -308 369 -317 L 370 -318 C 376 -320 379 -320 382 -320 C 386 -320 389 -318 389 -314 C 389 -297 351 -249 336 -232 C 281 -166 236 -112 236 -32 C 236 -30 236 -29 236 -27 L 238 -17 C 238 -16 238 -14 238 -13 C 243 71 295 140 333 199 C 337 206 338 213 338 220 C 338 235 333 248 333 248 C 333 248 120 501 95 526 C 88 533 78 537 69 537 C 55 537 40 527 40 507 C 40 500 42 492 46 484 C 52 468 134 395 134 291 C 134 238 112 176 48 108 C 33 94 27 78 27 66 C 27 46 42 32 42 32 Z",
  },
  "rest-eighth": {
    width: 356, top: 251, bottom: -361,
    path: "M 193 154 C 193 207 150 251 96 251 C 43 251 0 207 0 154 C 0 124 17 98 39 81 C 62 65 89 56 117 56 C 137 56 157 60 173 66 C 193 72 206 78 225 88 C 228 89 230 89 232 89 C 238 89 239 84 239 76 C 239 72 239 66 238 60 C 233 39 130 -248 104 -343 C 104 -360 137 -361 145 -361 C 161 -361 181 -359 196 -347 C 200 -344 341 161 341 161 C 347 187 354 210 356 217 C 356 232 341 239 338 240 C 336 240 331 240 323 235 C 312 226 240 140 193 140 Z",
  },
  "rest-sixteenth": {
    width: 461, top: 258, bottom: -720,
    path: "M 300 160 C 300 215 256 258 202 258 C 148 258 104 215 104 160 C 104 101 164 62 219 62 C 258 62 298 75 331 94 C 336 95 338 96 341 96 C 346 96 348 94 348 86 C 348 63 275 -151 265 -173 C 253 -200 215 -217 194 -217 C 196 -212 196 -207 196 -203 C 196 -148 151 -105 98 -105 C 43 -105 0 -148 0 -203 C 0 -262 60 -301 115 -301 C 153 -301 190 -288 223 -271 C 226 -271 229 -274 229 -279 L 228 -281 C 228 -282 228 -282 228 -282 L 91 -690 C 91 -690 91 -691 91 -691 L 89 -693 C 89 -706 102 -720 134 -720 C 176 -720 183 -703 189 -687 L 356 -138 C 393 -16 420 81 420 81 C 420 81 456 207 459 226 C 459 229 461 230 461 232 C 461 240 449 246 446 248 C 439 248 435 245 431 242 C 420 233 348 147 300 145 Z",
  },
  "rest-thirty_second": {
    width: 523, top: 613, bottom: -720,
    path: "M 508 603 C 501 603 497 600 492 598 C 482 590 410 503 361 503 L 361 516 C 361 570 318 613 264 613 C 210 613 166 570 166 516 C 166 487 183 461 206 444 C 217 433 232 428 246 423 C 258 420 269 418 284 418 C 321 418 360 432 393 449 C 395 451 397 451 399 451 C 409 451 415 436 415 426 L 413 423 C 413 423 413 422 413 422 L 357 192 C 350 168 302 140 279 140 C 281 144 281 148 281 153 C 281 207 236 251 183 251 C 128 251 85 207 85 153 C 85 124 102 98 125 81 C 137 71 150 65 164 60 C 176 58 189 55 203 55 C 240 55 278 69 311 86 C 312 88 314 88 315 88 C 323 88 325 76 325 69 L 268 -167 C 261 -197 216 -216 194 -217 C 196 -212 196 -207 196 -203 C 196 -148 153 -105 98 -105 C 45 -105 0 -148 0 -203 C 0 -262 60 -301 115 -301 C 154 -301 194 -288 228 -269 C 229 -268 230 -268 232 -268 C 236 -268 240 -272 240 -276 C 240 -282 141 -678 138 -688 C 137 -691 137 -694 137 -697 C 137 -708 145 -720 176 -720 C 222 -720 226 -706 232 -690 C 236 -672 484 436 484 436 C 484 436 518 564 521 582 C 521 585 523 586 523 588 C 523 600 511 603 508 603 Z",
  },
};

type RestStamp = Pick<StaffStamp, "x" | "y" | "size" | "glyph" | "dotted">;

export function notebookRestEngraving({ x, y, size, glyph, dotted }: RestStamp, onStaff = true) {
  if (!Object.prototype.hasOwnProperty.call(outlines, glyph)) return undefined;
  const outline = outlines[glyph as keyof typeof outlines];
  // Bravura's VexFlow outline has 360 units per staff space.
  const scale = STAFF_GAP / 360 * (size / 26);
  const rowTop = Math.floor(y / ROW_HEIGHT) * ROW_HEIGHT + STAFF_TOP;
  const whole = glyph === "rest-whole";
  const block = whole || glyph === "rest-half";
  const line = Math.round((y - rowTop) / STAFF_GAP) - (whole ? 1 : 0);
  const originY = block && onStaff ? rowTop + STAFF_GAP * Math.max(0, Math.min(4, line)) : y;
  const left = x - outline.width * scale / 2;
  const right = x + outline.width * scale / 2;
  const dot = dotted ? {
    x: right + 6 * size / 26, y: originY + (whole ? 1 : -1) * STAFF_GAP / 2,
    r: 72 * scale,
  } : undefined;
  const top = Math.min(originY - outline.top * scale, dot ? dot.y - dot.r : Infinity);
  const bottom = Math.max(originY - outline.bottom * scale, dot ? dot.y + dot.r : -Infinity);
  return {
    path: outline.path, scale, left, originY, dot,
    bounds: { x: left, y: top, width: (dot ? dot.x + dot.r : right) - left, height: bottom - top },
  };
}
