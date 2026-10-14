import fs from "node:fs";
import path from "node:path";

// Comparison must use the actual previous male/female bundle, not legacy ko-*.
const output = "generated-artifacts/korean-count";
const catalog = JSON.parse(fs.readFileSync("assets/sounds/count/catalog-durations.json", "utf8"));
const words = ["공", "일", "둘", "삼", "넷", "오", "육", "칠", "팔", "구"];
function audio(file) {
  const mime = file.endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
  return `<audio controls preload="none" src="data:${mime};base64,${fs.readFileSync(file).toString("base64")}"></audio>`;
}
const candidateIndex = process.argv.indexOf("--candidate-manifest");
if (candidateIndex >= 0) {
  const manifest = process.argv[candidateIndex + 1];
  if (!manifest || manifest.startsWith("--")) throw new Error("Missing candidate manifest");
  const candidates = JSON.parse(fs.readFileSync(manifest, "utf8"));
  const rows = candidates.clips.map(clip => {
    const key = `ko-${clip.speaker}-${clip.number}`;
    if (clip.language !== "ko" || clip.languageEnforced !== true || clip.word !== words[clip.number]) {
      throw new Error(`Candidate must explicitly use Korean: ${key}`);
    }
    return `<tr><th>${clip.speaker === "male" ? "남성" : "여성"} · ${clip.word}</th>
      <td>${audio(catalog[key].source)}</td><td>${audio(clip.source)}</td></tr>`;
  }).join("");
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>한국어 지정 엔진 원음 비교</title>
    <style>body{font:16px/1.6 system-ui;background:#101820;color:#edf4f8;margin:24px}
    main{max-width:1000px;margin:auto}.scroll{overflow:auto}td,th{padding:16px;text-align:left;border-bottom:1px solid #536577}
    audio{width:300px}p{color:#cedbe7}h1{color:#7ee0c3}</style>
    <main><h1>다른 엔진 · 한국어 지정 원음 비교</h1>
    <p>왼쪽은 이전 제안의 Eleven Multilingual v2 원음이고, 오른쪽은 Supertonic 2에서 <strong>한국어 ko를 명시</strong>한 새 합성 원음입니다.
    모두 가공 전 파일입니다. 남성 M1과 여성 F1은 서로 다른 기본 화자이며, 사람의 목소리를 복제하거나 피치를 바꾸지 않았습니다.</p>
    <p>넷이 네스처럼, 오가 어처럼 들리는지 비교해 주세요. 새 엔진도 발음 품질이 보장된 것은 아니므로 청취 판정을 기다리고 있습니다.
    이 후보 음원은 아직 앱에 반영하지 않았습니다.</p>
    <p>Supertonic 2 모델은 OpenRAIL-M에 따라 제작에만 사용했습니다. 여기에 들리는 소리는 AI 합성 음성입니다.
    앱에 모델·외부 서비스·계정을 추가하지 않습니다. 이 페이지의 음원은 내장되어 있어 오프라인 재생할 수 있습니다.</p>
    <div class="scroll"><table><thead><tr><th>화자 · 단어</th><th>이전 제안 원음</th><th>한국어 지정 새 원음</th></tr></thead><tbody>${rows}</tbody></table></div></main></html>`;
  const file = path.join(path.dirname(manifest), "comparison.html");
  fs.writeFileSync(file, html);
  console.log(file);
  process.exit(0);
}
const sections = ["male", "female"].map(speaker => {
  const rows = words.map((word, n) => {
    const key = `ko-${speaker}-${n}`;
    const clip = catalog[key];
    return `<tr><th>${word}${n === 4 || n === 5 ? " (중점 확인)" : ""}</th>
      <td>${audio(`${output}/before/${key}.wav`)}</td>
      <td>${audio(clip.source)}</td>
      <td>${audio(`assets/sounds/count/${key}.wav`)}<small>${clip.durationMs} ms</small></td></tr>`;
  }).join("");
  return `<section><h2>${speaker === "male" ? "남성: Min-joon" : "여성: Kelee K Seoul Narrator"}</h2>
    <div class="scroll"><table><thead><tr><th>단어</th><th>기존 번들</th><th>새 합성 원음 (가공 전)</th><th>새 앱 번들</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}).join("");
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>한국어 숫자 카운트 청취 비교</title><style>
body{font:16px/1.6 system-ui,sans-serif;background:#101820;color:#eaf0f5;margin:0}
main{max-width:1250px;margin:auto;padding:24px}h2{color:#7ee0c3}p,small{color:#c4d2dd}
.scroll{overflow:auto}table{border-collapse:collapse;width:100%}td,th{padding:12px;border-bottom:1px solid #43515e;text-align:left}
audio{width:260px;display:block}small{display:block}section{margin-top:32px}</style>
<main><h1>한국어 숫자 카운트: 기존·원음·새 번들 비교</h1>
<p>각 행을 왼쪽부터 재생해 비교하세요. 특히 <strong>넷의 받침이 ‘네스’처럼 들리지 않는지, 오의 모음이 ‘어’처럼 들리지 않는지</strong> 확인해 주세요.
공·일·둘·삼·넷·오·육·칠·팔·구 전체가 자연스럽고 짧고 또렷한지도 확인해야 합니다.</p>
<p>두 화자는 독립된 한국어 전문 카탈로그 화자입니다. 합성 속도 설정은 1.2이며 추가 시간 압축이나 피치 변조는 하지 않았습니다.
새 번들은 저레벨 무음 제거(앞 20ms·뒤 80ms 보호), 정규화, 짧은 경계 페이드만 적용합니다.
숫자 생략, BPM 변경, 재생 시 말끝 절단은 하지 않습니다. Bar 텍스트 TTS와는 별개입니다.</p>
<p><strong>판정 상태: 실제 사람의 청취 확인 전.</strong> 파일·매핑·길이 테스트는 발음의 자연스러움을 증명하지 않습니다.
이 비교 페이지의 음원은 모두 내장되어 있으며 외부 서비스나 계정 없이 재생됩니다. 앱의 고밀도 분할에서는 기존과 같이 말소리가 겹칠 수 있습니다.</p>
${sections}</main></html>`;
const file = path.join(output, "comparison.html");
fs.writeFileSync(file, html);
console.log(file);
