import { createT } from "../lib/i18n";
import {
  playOnboardingTestSound,
  requestOnboardingPermissions,
} from "../lib/onboarding-helpers";

describe("onboarding sound check", () => {
  it("creates and plays a player on the first attempt", () => {
    const player = { seekTo: jest.fn(), play: jest.fn() };
    const createPlayer = jest.fn(() => player);

    const result = playOnboardingTestSound(null, createPlayer);

    expect(result).toEqual({ ok: true, player });
    expect(createPlayer).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.seekTo).not.toHaveBeenCalled();
  });

  it("rewinds an existing player before replaying", () => {
    const player = { seekTo: jest.fn(), play: jest.fn() };

    const result = playOnboardingTestSound(player, jest.fn());

    expect(result).toEqual({ ok: true, player });
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it("does not mark a failed player creation as successful", () => {
    expect(playOnboardingTestSound(null, () => { throw new Error("audio unavailable"); }))
      .toEqual({ ok: false });
  });
});

describe("onboarding permission check", () => {
  it("requests microphone and location without denial alerts, retaining each result", async () => {
    const requestPermission = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(requestOnboardingPermissions(createT("ko"), requestPermission))
      .resolves.toEqual({ micGranted: true, locationGranted: false });
    expect(requestPermission.mock.calls.map(([kind]) => kind)).toEqual(["mic", "location"]);
    expect(requestPermission.mock.calls.map(([, , options]) => options))
      .toEqual([{ showAlertOnDeny: false }, { showAlertOnDeny: false }]);
  });
});