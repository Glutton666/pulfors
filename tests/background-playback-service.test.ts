import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let mockNative: {
  acquireBackgroundPlayback?: jest.Mock;
  releaseBackgroundPlayback?: jest.Mock;
} | null = null;

jest.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => mockNative,
}));

function loadService() {
  let service!: typeof import("../modules/sparse-metronome/src").BackgroundPlaybackService;
  jest.isolateModules(() => {
    service = require("../modules/sparse-metronome/src").BackgroundPlaybackService;
  });
  return service;
}

test("background ownership waits for native acknowledgement and passes the exact token", async () => {
  let acknowledge!: () => void;
  mockNative = {
    acquireBackgroundPlayback: jest.fn(() => new Promise<void>((resolve) => { acknowledge = resolve; })),
    releaseBackgroundPlayback: jest.fn(async () => ({ status: "stopped" })),
  };
  const service = loadService();
  let settled = false;
  const pending = service.acquire("owned-token").then(() => { settled = true; });
  await Promise.resolve();
  expect(settled).toBe(false);
  acknowledge();
  await pending;
  await service.release("owned-token");
  expect(mockNative.acquireBackgroundPlayback).toHaveBeenCalledWith("owned-token");
  expect(mockNative.releaseBackgroundPlayback).toHaveBeenCalledWith("owned-token");
});

test("older native builds fail explicitly instead of restoring the media-card backend", async () => {
  mockNative = {};
  const service = loadService();
  await expect(service.acquire("token")).rejects.toThrow("Rebuild the Android app");
  await expect(service.release("token")).rejects.toThrow("unavailable");
});

test("unsupported runtimes cannot silently acquire a foreground hold", async () => {
  mockNative = null;
  await expect(loadService().acquire("token")).rejects.toThrow("unavailable");
});

test("Android foreground hold is a plain service notification, not a MediaSession", () => {
  const nativeDir = resolve(__dirname, "../modules/sparse-metronome/android/src/main");
  const source = readFileSync(resolve(nativeDir, "java/expo/modules/sparsemetronome/BackgroundPlaybackService.kt"), "utf8");
  const manifest = readFileSync(resolve(nativeDir, "AndroidManifest.xml"), "utf8");
  expect(source).toContain("class BackgroundPlaybackService : Service()");
  expect(source).toContain("Notification.CATEGORY_SERVICE");
  expect(source).toContain("PowerManager.PARTIAL_WAKE_LOCK");
  expect(source).not.toMatch(/import .*MediaSession|import .*MediaStyle|\.setStyle\(/);
  expect(manifest).toContain('android:name="expo.modules.sparsemetronome.BackgroundPlaybackService"');
  const lease = readFileSync(resolve(__dirname, "../lib/background-playback-lease.ts"), "utf8");
  expect(lease).toContain('require("@/assets/sounds/silence.wav")');
  expect(lease).not.toContain("setActiveForLockScreen(");
});