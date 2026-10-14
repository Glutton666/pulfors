import fs from "node:fs";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";

// Build-time only. Nothing here is imported by the application.
// Supertonic 2 runs locally in Chromium/WASM, with explicit Korean language tokens.
// Code: MIT; model: OpenRAIL-M. Generic built-in voices, no voice cloning.
const revision = "2fdcdf7cced98e507e0656b986f66300667c68a6";
const origin = "https://supertone-supertonic-2.static.hf.space";
const sourceUrl = `https://huggingface.co/spaces/Supertone/supertonic-2/resolve/${revision}/script.js`;
const output = "generated-artifacts/korean-count-supertonic";
const words = ["공", "일", "둘", "삼", "넷", "오", "육", "칠", "팔", "구"];
const numbers = process.argv.includes("--all") ? words.map((_, i) => i) : [4, 5];
fs.mkdirSync(`${output}/raw`, { recursive: true });
const previous = fs.existsSync(`${output}/sources.json`)
  ? JSON.parse(fs.readFileSync(`${output}/sources.json`, "utf8")).clips : [];
const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`Source download: ${response.status}`);
const original = await response.text();
const marker = "    // Format time:";
if (!original.includes(marker)) throw new Error("Upstream synthesis interface changed");
const hook = `
    window.generateKoreanCountSource = async (voice, text) => {
        await initializeModels();
        currentLanguage = 'ko';
        currentVoice = voice;
        const embeddings = await loadStyleEmbeddings(voice);
        currentStyleTtlTensor = embeddings.styleTtl;
        currentStyleDpTensor = embeddings.styleDp;
        const result = await generateSupertonicSpeech(text, 12, 1 / 1.2);
        if (!result.success) throw new Error(result.error);
        return { sampleRate: result.sampleRate, pcm: Array.from(result.audioData) };
    };
`;
function encode(pcm, sr) {
  const wav = Buffer.alloc(44 + pcm.length * 2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(pcm.length * 2, 40);
  pcm.forEach((v, i) => wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  return wav;
}
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on("pageerror", e => console.error("Synthesis page:", e.message));
  await page.route(`${origin}/script.js`, route => route.fulfill({
    status: 200, contentType: "text/javascript",
    body: original.replace(marker, hook + marker),
  }));
  await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => typeof window.generateKoreanCountSource === "function", undefined, { timeout: 60000 });
  const clips = [];
  for (const [speaker, voiceId] of [["male", "M1"], ["female", "F1"]]) {
    for (const n of numbers) {
      const existing = previous.find(c => c.speaker === speaker && c.number === n
        && c.voiceId === voiceId && c.languageEnforced === true && c.inferenceSteps === 12);
      if (existing && fs.existsSync(existing.source) && !process.argv.includes("--force")) {
        const hash = createHash("sha256").update(fs.readFileSync(existing.source)).digest("hex");
        if (existing.sourceSha256 && existing.sourceSha256 !== hash) throw new Error(`Source changed: ${existing.source}`);
        clips.push({ ...existing, sourceSha256: hash });
        console.log(`Kept existing listening take ${existing.source}`);
        continue;
      }
      console.log(`Synthesizing ko/${speaker}/${words[n]} with explicit lang=ko`);
      const audio = await page.evaluate(async ({ voiceId, text }) => {
        return window.generateKoreanCountSource(voiceId, text);
      }, { voiceId, text: `${words[n]}.` });
      const source = `${output}/raw/ko-${speaker}-${n}.wav`;
      fs.writeFileSync(source, encode(audio.pcm, audio.sampleRate));
      clips.push({
        speaker, number: n, word: words[n], language: "ko", voiceId,
        name: `Supertonic 2 ${voiceId}`, modelId: "supertonic-2",
        synthesisSpeed: 1.2, languageEnforced: true, inferenceSteps: 12,
        source, license: "OpenRAIL-M", engineSource: sourceUrl,
        engineSha256: createHash("sha256").update(original).digest("hex"),
        sourceSha256: createHash("sha256").update(fs.readFileSync(source)).digest("hex"),
      });
      console.log(`Saved ${source}: ${Math.round(audio.pcm.length / audio.sampleRate * 1000)}ms`);
    }
  }
  fs.writeFileSync(`${output}/sources.json`, JSON.stringify({
    provider: "Supertone Supertonic 2 local ONNX synthesis", clips,
  }, null, 2) + "\n");
} finally {
  await browser.close();
}
