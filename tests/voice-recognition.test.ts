import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isVoiceRecognitionSupported,
  startVoiceRecognition,
} from "../lib/voice-recognition";

test("isVoiceRecognitionSupported: native(ios)에서는 false", () => {
  // react-native stub Platform.OS = "ios"
  assert.equal(isVoiceRecognitionSupported(), false);
});

test("startVoiceRecognition: 미지원 환경에서 onError('not-supported') 후 null", () => {
  let errMsg: string | null = null;
  const handle = startVoiceRecognition({
    lang: "ko",
    onResult: () => {},
    onError: (e) => { errMsg = e; },
    onEnd: () => {},
  });
  assert.equal(handle, null);
  assert.equal(errMsg, "not-supported");
});
