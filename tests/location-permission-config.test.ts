import { readFileSync } from "node:fs";
import { IOSConfig } from "expo/config-plugins";

const config = JSON.parse(readFileSync("app.json", "utf8")).expo;
const options = config.plugins.find(
  (plugin: unknown) => Array.isArray(plugin) && plugin[0] === "expo-location",
)[1];

describe("foreground-only practice room location", () => {
  it("explicitly disables both Always permission descriptions, including plugin defaults", () => {
    expect(options.locationAlwaysPermission).toBe(false);
    expect(options.locationAlwaysAndWhenInUsePermission).toBe(false);
    const plist = IOSConfig.Permissions.applyPermissions(
      {
        NSLocationAlwaysUsageDescription: "Default Always",
        NSLocationAlwaysAndWhenInUseUsageDescription: "Default Always and When In Use",
        NSLocationWhenInUseUsageDescription: "Default When In Use",
      },
      {
        NSLocationAlwaysUsageDescription: options.locationAlwaysPermission,
        NSLocationAlwaysAndWhenInUseUsageDescription: options.locationAlwaysAndWhenInUsePermission,
        NSLocationWhenInUseUsageDescription: options.locationWhenInUsePermission,
      },
      { ...config.ios.infoPlist },
    );
    expect(plist).not.toHaveProperty("NSLocationAlwaysUsageDescription");
    expect(plist).not.toHaveProperty("NSLocationAlwaysAndWhenInUseUsageDescription");
    expect(plist.NSLocationWhenInUseUsageDescription).toBe(options.locationWhenInUsePermission);
  });

  it("keeps foreground permissions without background location or location service", () => {
    expect(options.isIosBackgroundLocationEnabled).toBe(false);
    expect(options.isAndroidBackgroundLocationEnabled).toBe(false);
    expect(options.isAndroidForegroundServiceEnabled).toBe(false);
    expect(config.ios.infoPlist.UIBackgroundModes).not.toContain("location");
    expect(config.android.permissions).toEqual(expect.arrayContaining([
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
    ]));
    expect(config.android.permissions).not.toContain("android.permission.ACCESS_BACKGROUND_LOCATION");
    expect(config.android.permissions).not.toContain("android.permission.FOREGROUND_SERVICE_LOCATION");
    expect(config.ios.infoPlist.UIBackgroundModes).toContain("audio");
  });
});
