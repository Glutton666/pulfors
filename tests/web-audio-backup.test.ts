import { Platform } from "react-native";
import {
  audioAssetKey, readAudioAsBase64, readAllAudioFiles, restoreAudioFiles,
  remapEntryAudioUris, MAX_AUDIO_FILE_B64_CHARS,
} from "../lib/backup/shared";
import { audioDataUri, readWebAudioBase64 } from "../lib/web-audio-asset";

const wave = btoa("RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00");

describe("web audio backup assets", () => {
  const originalOS = Platform.OS;
  const originalFetch = global.fetch;
  beforeEach(() => { (Platform as { OS: string }).OS = "web"; });
  afterEach(() => { global.fetch = originalFetch; });
  afterAll(() => { (Platform as { OS: string }).OS = originalOS; });

  it("exports blob audio bytes rather than dropping them", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, arrayBuffer: async () => Uint8Array.from(atob(wave), (c) => c.charCodeAt(0)).buffer,
    });
    expect(await readAudioAsBase64("blob:https://example.test/sample#s=0.1")).toBe(wave);
    expect(global.fetch).toHaveBeenCalledWith("blob:https://example.test/sample");
  });

  it("restores native WAV backups to persistent, byte-identified web data URLs", async () => {
    const mapping = await restoreAudioFiles({ "sample.bin": wave });
    expect(mapping.get("sample.bin")).toBe(`data:audio/wav;base64,${wave}`);
    expect(await readAudioAsBase64(mapping.get("sample.bin")!)).toBe(wave);
  });

  it("preserves distinct same-name samples and trim fragments through nested queues", async () => {
    const a = "blob:https://example.test/a/shared.wav";
    const b = "blob:https://example.test/b/shared.wav";
    const map = await restoreAudioFiles({
      [audioAssetKey(a)]: wave,
      [audioAssetKey(b)]: btoa("OggSdifferent"),
    });
    const entry = remapEntryAudioUris({
      noteSamples: { "0": `${a}#s=0.1&e=0.9` },
      noteQueueEntries: [{ noteSamples: { "0": b } }],
    } as any, map);
    expect(entry.noteSamples?.["0"]).toBe(`${audioDataUri(wave)}#s=0.1&e=0.9`);
    expect(entry.noteQueueEntries?.[0].noteSamples?.["0"]).toMatch(/^data:audio\/ogg;base64,/);
  });

  it("re-exports restored data audio with bounded asset names", async () => {
    const uri = audioDataUri(wave);
    const key = audioAssetKey(uri);
    expect(key.length).toBeLessThan(50);
    expect(await readAllAudioFiles(new Map([[key, uri]]))).toEqual({ [key]: wave });
  });

  it("fails instead of reporting success when blob audio is unavailable", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Blob expired"));
    await expect(readAllAudioFiles(new Map([["sample", "blob:expired"]]))).rejects.toThrow("Blob expired");
    await expect(readAudioAsBase64("file:///another-device/sample.wav")).rejects.toThrow("not available");
  });

  it("rejects corrupt and oversized embedded audio without partial successful restores", async () => {
    await expect(restoreAudioFiles({ good: wave, bad: "not base64!" })).rejects.toThrow("Invalid audio");
    await expect(readWebAudioBase64(audioDataUri(wave), 4)).rejects.toThrow("size limit");
    expect(MAX_AUDIO_FILE_B64_CHARS).toBeGreaterThan(wave.length);
  });

  it("identifies recording containers from bytes rather than blob/file suffixes", () => {
    expect(audioDataUri(btoa("\x1a\x45\xdf\xa3webm"))).toMatch(/^data:audio\/webm/);
    expect(audioDataUri(btoa("\x00\x00\x00\x18ftypM4A "))).toMatch(/^data:audio\/mp4/);
    expect(audioDataUri(btoa("ID3mp3"))).toMatch(/^data:audio\/mpeg/);
  });
});