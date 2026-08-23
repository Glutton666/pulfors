import { createT } from "../lib/i18n";
import { resolveRecoveryToast } from "../hooks/usePermissionRecoveryToast";

describe("permission recovery toast presentation", () => {
  it("uses the current language when a permission recovery toast is visible", () => {
    const visibleMicToast = { type: "permission" as const, kind: "mic" as const };

    expect(resolveRecoveryToast(visibleMicToast, createT("ko")))
      .toBe(createT("ko")("permissions", "recoveredMic"));
    expect(resolveRecoveryToast(visibleMicToast, createT("en")))
      .toBe(createT("en")("permissions", "recoveredMic"));
  });

  it("keeps arbitrary audio recovery messages and null state intact across layout changes", () => {
    const customToast = { type: "message" as const, message: "Audio resumed" };

    // The presentation value is independent of width/orientation; the hook
    // remains mounted while the device rotates, so a visible message persists.
    expect(resolveRecoveryToast(customToast, createT("en"))).toBe("Audio resumed");
    expect(resolveRecoveryToast(null, createT("en"))).toBeNull();
  });
});