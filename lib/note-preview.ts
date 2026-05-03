import type { SampleChannel } from "./stereo-channel";

export interface PreviewDeps {
  decode?: (uri: string) => Promise<Float32Array | null>;
  save?: (
    mono: Float32Array,
    channel: "left" | "right",
    filename: string,
  ) => Promise<string>;
  now?: () => number;
}

// audio-renderer를 정적으로 import하면 expo-asset/expo-file-system 등이
// 전이적으로 로딩되어 Node 테스트 환경에서 실패한다. 기본 deps는 지연 로딩.
async function getDefaultDeps(): Promise<{
  decode: NonNullable<PreviewDeps["decode"]>;
  save: NonNullable<PreviewDeps["save"]>;
}> {
  const m = await import("./audio-renderer");
  return { decode: m.decodeSampleFile, save: m.saveStereoSampleWav };
}

export async function buildPreviewUri(
  uri: string,
  channel: SampleChannel,
  deps: PreviewDeps = {},
): Promise<string> {
  if (channel === "both") return uri;
  let decode = deps.decode;
  let save = deps.save;
  if (!decode || !save) {
    const d = await getDefaultDeps();
    decode = decode ?? d.decode;
    save = save ?? d.save;
  }
  const now = deps.now ?? (() => Date.now());
  try {
    const rawUri = uri.split("#")[0];
    const mono = await decode(rawUri);
    if (!mono || mono.length === 0) return uri;
    const filename = `note_preview_${channel}_${now()}.wav`;
    return await save(mono, channel, filename);
  } catch {
    return uri;
  }
}
