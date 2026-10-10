import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const output = "generated-artifacts/voice-count-comparison";
fs.mkdirSync(output, { recursive: true });
const catalog = JSON.parse(fs.readFileSync("assets/sounds/count/catalog-durations.json", "utf8"));
const words = {
  ko: ["공", "일", "둘", "삼", "넷", "오", "육", "칠", "팔", "구"],
  en: ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen"],
};
function audio(file) {
  const mime = file.endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
  return `<audio controls preload="none" src="data:${mime};base64,${fs.readFileSync(file).toString("base64")}"></audio>`;
}
function joined(language, speaker, numbers) {
  const clips = numbers.map(n => {
    const file = `assets/sounds/count/${language}${speaker ? `-${speaker}` : ""}-${n}.wav`;
    const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file,
      "-ar", "44100", "-ac", "1", "-f", "s16le", "pipe:1"]);
    return raw;
  });
  const step = Math.round(44100 * 0.7) * 2;
  const buffer = Buffer.alloc(step * clips.length);
  clips.forEach((clip, i) => clip.copy(buffer, i * step));
  const file = path.join(output, `${language}-${speaker || "before"}-sequence.wav`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "s16le", "-ar", "44100",
    "-ac", "1", "-i", "pipe:0", file], { input: buffer });
  return file;
}
const rows = Object.entries(catalog).map(([key, clip]) => {
  const [lang, speaker, n] = key.split("-");
  const delta = clip.durationMs - clip.previousDurationMs;
  return `<tr><td>${lang === "ko" ? "한국어" : "English"}</td><td>${speaker === "male" ? "남성" : "여성"}</td><td>${words[lang][Number(n)]}</td><td>${clip.previousDurationMs}</td><td>${clip.durationMs}</td><td>${delta > 0 ? "+" : ""}${delta}</td></tr>`;
}).join("");
const groups = [4, 5, "sequence"].map(n => {
  const label = n === 4 ? "넷" : n === 5 ? "오" : "일 · 둘 · 삼 · 넷 · 오";
  const cells = ["", "male", "female"].map(speaker => {
    const file = n === "sequence"
      ? joined("ko", speaker, [1, 2, 3, 4, 5])
      : `assets/sounds/count/ko${speaker ? `-${speaker}` : ""}-${n}.wav`;
    return `<div><h3>${speaker === "" ? "변경 전" : speaker === "male" ? "새 남성" : "새 여성"}</h3>${audio(file)}</div>`;
  }).join("");
  return `<section><h2>${label}</h2><div class="grid">${cells}</div></section>`;
}).join("");
const raw = ["male", "female"].map(speaker => `<div><h3>한국어 ${speaker === "male" ? "남성" : "여성"} 생성 원본 (공~구)</h3>${audio(`attached_assets/generated_audio/count_sequence_ko_${speaker}.mp3`)}</div>`).join("");
const english = ["", "male", "female"].map(speaker => `<div><h3>English ${speaker === "" ? "변경 전" : speaker === "male" ? "새 남성" : "새 여성"}</h3>${audio(joined("en", speaker, [1, 2, 3, 4, 5, 13, 14, 15, 16]))}</div>`).join("");
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>음성 카운트 비교</title>
<style>body{margin:0;background:#0b121b;color:#e7edf4;font:16px/1.6 system-ui,sans-serif}main{max-width:1050px;margin:auto;padding:28px}h1{font-size:30px}h2{color:#59d8bd}h3{font-size:15px}p{color:#b5c6d5}section{border-top:1px solid #2b3949;padding:16px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}audio{width:100%}.table{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:9px;text-align:left;border-bottom:1px solid #2b3949}th{color:#59d8bd}small{color:#b5c6d5}</style>
<main><h1>음성 카운트: 변경 전후 비교</h1><p>한국어 ‘넷·오’와 연속 카운트를 비교할 수 있습니다. 각 언어의 남성·여성은 서로 다른 카탈로그 화자입니다. 모두 오프라인 파일이며 앱 재생 중 TTS를 호출하지 않습니다.</p>
<p>간결한 카운트 음원을 새로 생성하고, 음높이를 보존하는 1.15배 시간 압축·보수적인 무음 제거·정규화를 적용했습니다. BPM과 숫자 시작 시간은 바뀌지 않습니다. 비교 연속 파일은 숫자 사이 700ms 간격이며 앱의 분할 규칙을 재현한 파일은 아닙니다.</p>
<p><strong>검증 한계:</strong> 길이와 파일 유효성은 자동 확인했습니다. 발음의 자연스러움, ‘넷’이 ‘네스’로 또는 ‘오’가 ‘어’로 들리는지는 실제 청취 판정이 필요합니다. iPhone·Android 기기 청취는 아직 검증하지 않았습니다. 아주 짧은 분할에서 음성 겹침은 계속 발생합니다.</p>
${groups}<section><h2>가공 전 생성 원본</h2><div class="grid">${raw}</div></section>
<section><h2>영어 비교</h2><div class="grid">${english}</div></section>
<section><h2>숫자별 길이 (ms)</h2><small>같은 숫자를 비교하되 새 화자는 변경 전 화자와 다릅니다. 모든 숫자가 개별적으로 짧아지는 것은 아닙니다.</small><div class="table"><table><thead><tr><th>언어</th><th>화자</th><th>숫자</th><th>변경 전</th><th>변경 후</th><th>차이</th></tr></thead><tbody>${rows}</tbody></table></div></section></main></html>`;
const file = path.join(output, "comparison.html");
fs.writeFileSync(file, html);
console.log(file);
