import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { noteTtsNative } from "@/lib/note-tts-runtime";
import { NoteTtsSession, noteTtsErrorCode, type NoteTtsResult, type NoteTtsVoice } from "@/lib/note-tts";
import { captureBreadcrumb } from "@/lib/error-tracking";
import { prepareNoteTtsFile } from "@/lib/note-tts-file";

export function useNoteTts(
  visible: boolean,
  target: string,
  onGenerated: (result: NoteTtsResult, text: string) => void,
  onInvalidate: () => void,
) {
  const native = Platform.OS === "web" ? null : noteTtsNative;
  const sessionRef = useRef<NoteTtsSession | null>(native ? new NoteTtsSession(native, prepareNoteTtsFile) : null);
  const epoch = useRef(0);
  const generating = useRef(false);
  const liveTarget = useRef({ visible, target });
  liveTarget.current = { visible, target };
  const callbacks = useRef({ onGenerated, onInvalidate });
  callbacks.current = { onGenerated, onInvalidate };
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [voices, setVoices] = useState<NoteTtsVoice[]>([]);
  const [status, setStatus] = useState<"unavailable" | "loading" | "ready" | "generating">(
    native ? "ready" : "unavailable",
  );
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    ++epoch.current;
    generating.current = false;
    callbacks.current.onInvalidate();
    void sessionRef.current?.reset().catch(() => {
      captureBreadcrumb({ category: "noteTts", message: "Could not clean up cancelled speech output", level: "warning" });
    });
    setStatus(native ? "ready" : "unavailable");
    setError(null);
  }, [native]);

  useEffect(() => {
    reset();
    setText("");
    setVoiceId("");
    setVoices([]);
    return reset;
  }, [visible, target, reset]);

  const loadVoices = useCallback(async () => {
    if (!native) return;
    const token = ++epoch.current;
    setStatus("loading");
    setError(null);
    try {
      const installed = await native.getVoices();
      if (token !== epoch.current) return;
      setVoices(installed);
      setVoiceId(installed[0]?.id ?? "");
      setStatus("ready");
      if (installed.length === 0) setError("noVoice");
    } catch (e) {
      if (token !== epoch.current) return;
      setStatus("ready"); // Retry can initialize the engine again.
      setError(noteTtsErrorCode(e));
    }
  }, [native]);

  const generate = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !visible || status !== "ready" || generating.current) return;
    generating.current = true;
    const token = ++epoch.current;
    setStatus("generating");
    setError(null);
    try {
      const result = await session.generate(text, voiceId);
      if (token !== epoch.current || !result) return;
      if (!liveTarget.current.visible || liveTarget.current.target !== target) {
        await session.reset();
        return;
      }
      setStatus("ready");
      captureBreadcrumb({ category: "noteTts", message: "Local speech file ready for sample playback", data: { duration: result.duration } });
      callbacks.current.onGenerated(result, text.trim());
    } catch (e) {
      if (token !== epoch.current) return;
      setStatus("ready");
      setError(noteTtsErrorCode(e));
      captureBreadcrumb({ category: "noteTts", message: "Speech file generation or validation failed", level: "warning", data: { code: noteTtsErrorCode(e) } });
    } finally {
      if (token === epoch.current) generating.current = false;
    }
  }, [visible, target, status, text, voiceId]);

  const changeText = useCallback((value: string) => { reset(); setText(value); }, [reset]);
  const changeVoice = useCallback((value: string) => { reset(); setVoiceId(value); }, [reset]);
  const commit = useCallback((uri: string) => sessionRef.current?.commit(uri), []);
  const beginCommit = useCallback((uri: string) => sessionRef.current?.beginCommit(uri) ?? ((saved: boolean) => {
    if (saved) sessionRef.current?.commit(uri);
  }), []);
  return { text, voiceId, voices, status, error, loadVoices, generate, reset, changeText, changeVoice, commit, beginCommit };
}
