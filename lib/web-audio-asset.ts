/** Persist audio bytes, not temporary blob URLs, so backups survive a reload. */
export function audioDataUri(base64: string): string {
  if (!base64.length || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error("Invalid audio data in backup");
  }
  const header = atob(base64.slice(0, 80));
  let mime = "application/octet-stream";
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WAVE") mime = "audio/wav";
  else if (header.startsWith("OggS")) mime = "audio/ogg";
  else if (header.startsWith("fLaC")) mime = "audio/flac";
  else if (header.slice(4, 8) === "ftyp") mime = "audio/mp4";
  else if (header.startsWith("\x1a\x45\xdf\xa3")) mime = "audio/webm";
  else if (header.charCodeAt(0) === 0xff && (header.charCodeAt(1) & 0xf6) === 0xf0) mime = "audio/aac";
  else if (header.startsWith("ID3") || (header.charCodeAt(0) === 0xff && (header.charCodeAt(1) & 0xe0) === 0xe0)) mime = "audio/mpeg";
  return `data:${mime};base64,${base64}`;
}

export async function readWebAudioBase64(uri: string, maxChars: number): Promise<string> {
  if (uri.startsWith("data:")) {
    const index = uri.indexOf(";base64,");
    if (index < 0) throw new Error("Unsupported inline audio encoding");
    const base64 = uri.slice(index + 8);
    if (base64.length > maxChars) throw new Error("Audio file exceeds backup size limit");
    audioDataUri(base64); // Validate before reporting a successful backup.
    return base64;
  }
  if (!uri.startsWith("blob:")) throw new Error("Audio file is not available in this browser");
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Could not read audio for backup");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || Math.ceil(bytes.length / 3) * 4 > maxChars) {
    throw new Error("Audio file is empty or exceeds backup size limit");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}