export type NoteTtsErrorKey =
  | "noVoice"
  | "unavailable"
  | "failed"
  | "cancelled"
  | "timeout"
  | "invalidText"
  | "invalidAudio"
  | "tooLarge"
  | "busy";

export type NoteTtsLanguage = "ko" | "en";

const copy = {
  en: {
    title: "Text to speech",
    description: "Create a reusable spoken sample for this bar (up to 300 characters / 30 seconds).",
    regenerate: "Edit text or voice",
    webUnsupported: "TTS file generation is not supported on web yet. Recording, importing audio, and playing saved files are unaffected.",
    unavailableTitle: "Voice generation unavailable",
    unavailableBody: "This app build does not include the native voice module. Rebuild the app with the module installed to generate audio.",
    voiceSection: "Installed voices",
    noVoices: "No installed voices were reported by the device.",
    voiceFilter: "Show voices",
    allVoices: "All",
    male: "Male",
    female: "Female",
    unknownGender: "Gender not provided",
    unknownVoiceNote: "This installed voice has no gender metadata. It is available under All installed voices.",
    textLabel: "Korean text",
    textPlaceholder: "Type what you want the metronome to say…",
    charsRemaining: "{count} / 300",
    selectVoice: "Select an installed voice to continue.",
    emptyText: "Enter some text before generating.",
    generate: "Generate sample",
    generating: "Generating voice sample…",
    cancel: "Cancel",
    retry: "Try again",
    back: "Back",
    loading: "Checking installed voices…",
    previewLoad: "Could not load this audio file. Try preview again, or regenerate/import the file.",
    previewSeek: "Could not select the preview range. Try again or adjust the trim range.",
    previewPlay: "Playback could not start. Check audio output and try preview again.",
    errors: {
      noVoice: "Choose an offline Korean voice. If none are listed, install a Korean voice in device speech settings.",
      unavailable: "The device speech engine could not start. Check the engine and offline Korean voices in device settings, then retry.",
      failed: "The voice sample could not be generated. Try again.",
      cancelled: "Voice generation was cancelled.",
      timeout: "Voice generation took too long. Try again.",
      invalidText: "Enter valid text to generate a voice sample.",
      invalidAudio: "The generated file contains no playable speech or uses an unsupported format. Try generating with another installed voice.",
      tooLarge: "The audio is too long or invalid. Use shorter text (up to 300 characters and 30 seconds).",
      busy: "Another voice sample is being generated. Please wait.",
    },
  },
  ko: {
    title: "음성으로 만들기",
    description: "이 마디에서 반복 재생할 음성 샘플을 만듭니다. 최대 300자·30초.",
    regenerate: "문장·음성 수정",
    webUnsupported: "웹에서는 아직 TTS 파일 생성을 지원하지 않습니다. 기존 녹음, 오디오 가져오기, 저장된 파일 재생은 그대로 사용할 수 있습니다.",
    unavailableTitle: "음성 생성 기능을 사용할 수 없음",
    unavailableBody: "현재 앱 빌드에 네이티브 음성 모듈이 포함되어 있지 않습니다. 모듈을 포함해 앱을 다시 빌드해야 음성을 생성할 수 있습니다.",
    voiceSection: "설치된 음성",
    noVoices: "기기에서 설치된 음성을 찾지 못했습니다.",
    voiceFilter: "음성 보기",
    allVoices: "전체",
    male: "남성",
    female: "여성",
    unknownGender: "성별 정보 없음",
    unknownVoiceNote: "이 음성은 성별 메타데이터를 제공하지 않습니다. 전체 설치된 음성에서 선택할 수 있습니다.",
    textLabel: "한국어 문장",
    textPlaceholder: "음성으로 읽을 내용을 입력하세요…",
    charsRemaining: "{count} / 300",
    selectVoice: "계속하려면 설치된 음성을 선택하세요.",
    emptyText: "생성할 문장을 입력하세요.",
    generate: "샘플 생성",
    generating: "음성 샘플 생성 중…",
    cancel: "취소",
    retry: "다시 시도",
    back: "뒤로",
    loading: "설치된 음성을 확인하고 있습니다…",
    previewLoad: "음성 파일을 불러오지 못했습니다. 미리듣기를 다시 누르거나 파일을 다시 생성·가져오세요.",
    previewSeek: "미리듣기 구간으로 이동하지 못했습니다. 다시 시도하거나 자르기 구간을 조정하세요.",
    previewPlay: "재생을 시작하지 못했습니다. 소리 출력 상태를 확인하고 미리듣기를 다시 누르세요.",
    errors: {
      noVoice: "오프라인 한국어 음성을 선택하세요. 목록이 없으면 기기 음성 설정에서 한국어 음성을 설치하세요.",
      unavailable: "기기의 음성 엔진을 시작하지 못했습니다. 기기 설정에서 음성 엔진과 오프라인 한국어 음성을 확인한 뒤 다시 시도하세요.",
      failed: "음성 샘플을 생성하지 못했습니다. 다시 시도하세요.",
      cancelled: "음성 생성을 취소했습니다.",
      timeout: "음성 생성 시간이 초과되었습니다. 다시 시도하세요.",
      invalidText: "음성 샘플을 만들 문장을 입력하세요.",
      invalidAudio: "생성된 파일에 재생 가능한 음성이 없거나 지원하지 않는 형식입니다. 다른 설치 음성으로 다시 생성하세요.",
      tooLarge: "생성 음원이 너무 길거나 올바르지 않습니다. 300자·30초 이내의 짧은 문장으로 다시 시도하세요.",
      busy: "다른 음성 샘플을 생성 중입니다. 잠시 기다려 주세요.",
    },
  },
} as const;

export type NoteTtsCopy = (typeof copy)[NoteTtsLanguage];

export function getNoteTtsCopy(language: string): NoteTtsCopy {
  return copy[language === "ko" ? "ko" : "en"];
}

export function translateNoteTtsError(error: string | null | undefined, language: string): string | null {
  if (!error) return null;
  const messages = getNoteTtsCopy(language).errors;
  const key = error.trim() as NoteTtsErrorKey;
  if (Object.prototype.hasOwnProperty.call(messages, key)) {
    return messages[key as keyof typeof messages];
  }
  return error;
}
