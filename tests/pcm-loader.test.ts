jest.mock("@/lib/audio-renderer", () => ({
  decodeSampleFile: jest.fn(),
  loadAssetPCM: jest.fn(),
}));

import { decodeSampleFile, loadAssetPCM } from "@/lib/audio-renderer";
import {
  PCMLoadError,
  isPCMCancelled,
  loadPCM,
} from "@/lib/pcm-loader";

const mockDecode = decodeSampleFile as jest.MockedFunction<typeof decodeSampleFile>;
const mockAsset = loadAssetPCM as jest.MockedFunction<typeof loadAssetPCM>;

describe("PCM loader result classification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("classifies an already-aborted request as cancellation without decoding", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = loadPCM("file:///sample.wav", controller.signal);
    await expect(result).rejects.toMatchObject({ kind: "cancelled" });
    await result.catch(error => expect(isPCMCancelled(error)).toBe(true));
    expect(mockDecode).not.toHaveBeenCalled();
  });

  it("classifies an empty decoder result as decode failure", async () => {
    mockDecode.mockResolvedValueOnce(null);
    await expect(loadPCM("file:///broken.wav")).rejects.toMatchObject({
      name: "PCMLoadError",
      kind: "decode-failed",
    });
  });

  it("classifies non-finite decoded samples as decode failure", async () => {
    mockDecode.mockResolvedValueOnce(new Float32Array([0, Number.NaN]));
    const result = loadPCM("file:///nan.wav");
    await expect(result).rejects.toBeInstanceOf(PCMLoadError);
    await result.catch(error => expect(error).toMatchObject({ kind: "decode-failed" }));
  });

  it("uses the asset decoder for numeric sources", async () => {
    mockAsset.mockResolvedValueOnce(new Float32Array([0.25]));
    await expect(loadPCM(42)).resolves.toEqual(new Float32Array([0.25]));
    expect(mockAsset).toHaveBeenCalledWith(42, undefined);
  });

  it("uses the asset decoder for bundled web asset URLs", async () => {
    const source = "/assets/?unstable_path=.%2Fassets%2Fsounds%2Fclick.wav";
    mockAsset.mockResolvedValueOnce(new Float32Array([0.5]));
    await expect(loadPCM({ kind: "asset", source })).resolves.toEqual(new Float32Array([0.5]));
    expect(mockAsset).toHaveBeenCalledWith(source, undefined);
    expect(mockDecode).not.toHaveBeenCalled();
  });
});