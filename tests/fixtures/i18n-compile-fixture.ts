// 컴파일 타임 가드 검증용 fixture.
// 목적: 새 언어 코드를 추가했을 때 Record<LanguageCode, string> 강제가
// 누락 키에 대해 실제로 타입 에러를 내는지 tsc 자체로 보증한다.
// (ts-expect-error 디렉티브가 발화하지 않으면 tsc가 이 파일을 거부하므로,
//  본 fixture가 컴파일된다는 사실 자체가 타입 강제 동작 중의 증거다.)
import type { Language } from "@/lib/i18n";

// 신규 언어를 추가한 가상의 LanguageCode를 시뮬레이트한다.
type SimulatedLanguage = Language | "ja";
type SimulatedLeaf = Record<SimulatedLanguage, string>;

// 누락(ja 없음): 타입 에러가 나야 정상.
// @ts-expect-error: ja 누락 — Record 강제가 동작하면 여기서 에러가 잡힌다.
export const _incomplete: SimulatedLeaf = { ko: "x", en: "x" };

// 모두 채운 경우: 에러 없음.
export const _complete: SimulatedLeaf = { ko: "x", en: "x", ja: "x" };
