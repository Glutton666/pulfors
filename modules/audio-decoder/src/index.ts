import { requireNativeModule } from "expo-modules-core";

interface AudioDecoderNativeModule {
  decodeToWavAsync(sourceUri: string, destUri: string): Promise<string>;
}

let nativeModule: AudioDecoderNativeModule | null = null;

function getNativeModule(): AudioDecoderNativeModule {
  if (!nativeModule) {
    nativeModule = requireNativeModule<AudioDecoderNativeModule>("AudioDecoder");
  }
  return nativeModule;
}

/**
 * Returns true if the native AudioDecoder module is linked (i.e. this is a
 * custom dev/production build, not Expo Go and not web).
 */
export function isAudioDecoderAvailable(): boolean {
  try {
    getNativeModule();
    return true;
  } catch {
    return false;
  }
}

/**
 * Decodes a compressed audio file (MP3, M4A/AAC, or any format the OS codec
 * supports) into a PCM WAV file at `destUri`, using the platform's native
 * decoder (AVFoundation on iOS, MediaCodec on Android).
 *
 * Both `sourceUri` and `destUri` must be local `file://` paths. Resolves
 * with `destUri` on success; throws on failure (unsupported codec, missing
 * audio track, I/O error).
 */
export async function decodeToWav(sourceUri: string, destUri: string): Promise<string> {
  return getNativeModule().decodeToWavAsync(sourceUri, destUri);
}
