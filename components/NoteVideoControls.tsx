import React, { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { INITIAL_VIDEO_READING, formatVideoPosition, parseVideoPosition, parseYouTubeVideo, type NoteVideoAttachment, type NoteVideoSource, type VideoDriver, type VideoReading } from "@/lib/note-video";
import { discardUncommittedNoteVideo, pickNoteVideo } from "@/lib/note-video-files";
import { activeStorageProfile } from "@/lib/profile-storage";
import type { NoteVideoPlayback } from "@/hooks/useNoteVideoPlayback";
import { NoteVideoPlayer } from "./NoteVideoPlayer";

export function useVideoText() {
  const { language } = useLanguage();
  return (ko: string, en: string) => language === "ko" ? ko : en;
}

function Button({ text, onPress, selected, disabled, testID }: {
  text: string; onPress: () => void; selected?: boolean; disabled?: boolean; testID?: string;
}) {
  const { colors: C } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }} disabled={disabled}
    testID={testID} onPress={onPress} style={[s.button, { borderColor: selected ? C.accent : C.border,
      backgroundColor: selected ? `${C.accent}20` : C.surface, opacity: disabled ? 0.45 : 1 }]}>
    <Text style={{ color: selected ? C.accent : C.text, fontSize: 13, fontWeight: "600" }}>{text}</Text>
  </Pressable>;
}

function Timeline({ reading, seek, disabled }: { reading: VideoReading; seek: (seconds: number) => void; disabled?: boolean }) {
  const tr = useVideoText();
  const { colors: C } = useTheme();
  const width = useRef(1);
  const dur = reading.duration;
  return <View style={s.row}>
    <Button text="−5s" disabled={disabled || !dur} onPress={() => seek(reading.seconds - 5)} />
    <Pressable accessibilityRole="adjustable" accessibilityLabel={tr("영상 위치", "Video position")}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      accessibilityValue={{ min: 0, max: Math.round(dur), now: Math.round(reading.seconds) }}
      onAccessibilityAction={({ nativeEvent }) => seek(reading.seconds + (nativeEvent.actionName === "increment" ? 5 : -5))}
      disabled={disabled || !dur} onLayout={(e) => { width.current = e.nativeEvent.layout.width || 1; }}
      onPress={(e) => seek(Math.max(0, Math.min(1, e.nativeEvent.locationX / width.current)) * dur)}
      style={{ flex: 1, minWidth: 75, minHeight: 36, justifyContent: "center", gap: 3 }}>
      <View pointerEvents="none" style={{ height: 4, borderRadius: 3, backgroundColor: C.border }}>
        <View style={{ height: 4, borderRadius: 3, backgroundColor: C.accent,
          width: `${dur ? Math.min(100, reading.seconds / dur * 100) : 0}%` }} />
      </View>
      <Text pointerEvents="none" style={{ color: C.textSecondary, fontSize: 11, textAlign: "center", fontVariant: ["tabular-nums"] }}>
        {formatVideoPosition(reading.seconds)} / {dur ? formatVideoPosition(dur) : "—"}
      </Text>
    </Pressable>
    <Button text="+5s" disabled={disabled || !dur} onPress={() => seek(reading.seconds + 5)} />
  </View>;
}

function OpenYouTube({ source }: { source: NoteVideoSource }) {
  const tr = useVideoText();
  const { colors: C } = useTheme();
  const [failed, setFailed] = useState(false);
  if (source.kind !== "youtube") return null;
  const url = `https://www.youtube.com/watch?v=${source.videoId}`;
  return <View><Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(url).catch(() => setFailed(true)); }}>
    <Text style={{ color: C.accent, fontSize: 13, paddingVertical: 6 }}>{tr("유튜브에서 열기 (동기화 없음)", "Open in YouTube (not synced)")}</Text>
  </Pressable>{failed && <Text selectable style={{ color: C.textSecondary }}>{url}</Text>}</View>;
}

export function NoteVideoEditor({ label, video, onClose, onSave }: {
  label: string; video?: NoteVideoAttachment; onClose: () => void; onSave: (video?: NoteVideoAttachment) => void;
}) {
  const tr = useVideoText();
  const { colors: C } = useTheme();
  const [source, setSource] = useState(video?.source);
  const [link, setLink] = useState(video?.source.kind === "youtube" ? `https://www.youtube.com/watch?v=${video.source.videoId}` : "");
  const [start, setStart] = useState(formatVideoPosition(video?.startSeconds ?? 0));
  const [first, setFirst] = useState(formatVideoPosition(video?.firstBeatSeconds ?? 0));
  const [count, setCount] = useState<0 | 1 | 2>(video?.countInMeasures ?? 0);
  const [offset, setOffset] = useState(String(video?.offsetMs ?? 0));
  const [reading, setReading] = useState(INITIAL_VIDEO_READING);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);
  const driver = useRef<VideoDriver | null>(null);
  const mounted = useRef(true);
  const draftAsset = useRef<string | null>(null);
  const profile = useRef(activeStorageProfile());
  const setDriver = useCallback((next: VideoDriver | null) => { driver.current = next; }, []);
  const cleanup = useCallback((id: string) => {
    void discardUncommittedNoteVideo(id, profile.current).catch((e) => console.warn("Could not clear video draft", e));
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (draftAsset.current) cleanup(draftAsset.current); };
  }, [cleanup]);
  const changeSource = (next: NoteVideoSource) => {
    driver.current?.pause();
    if (draftAsset.current) cleanup(draftAsset.current);
    draftAsset.current = next.kind === "file" ? next.assetId : null;
    setSource(next);
    setError("");
    setReading(INITIAL_VIDEO_READING);
  };
  const applyLink = () => {
    const id = parseYouTubeVideo(link);
    if (!id) { setError(tr("유효한 유튜브 링크를 입력하세요.", "Enter a valid YouTube link.")); return; }
    if (source?.kind !== "youtube" || source.videoId !== id) changeSource({ kind: "youtube", videoId: id });
    else setError("");
  };
  const pick = async () => {
    setPicking(true);
    try {
      const file = await pickNoteVideo();
      if (!file) return;
      if (mounted.current) { changeSource(file); setLink(""); }
      else cleanup(file.assetId);
    } catch {
      if (mounted.current) setError(tr("파일을 저장하지 못했어요. 150 MB 이하의 MP4, MOV, M4V 또는 WebM을 선택하세요.", "Could not save the file. Choose an MP4, MOV, M4V or WebM under 150 MB."));
    } finally { if (mounted.current) setPicking(false); }
  };
  const save = () => {
    const id = link.trim() ? parseYouTubeVideo(link) : null;
    if (link.trim() && !id) { setError(tr("유효한 유튜브 링크를 입력하세요.", "Enter a valid YouTube link.")); return; }
    const chosen: NoteVideoSource | undefined = id ? { kind: "youtube", videoId: id } : source;
    const startSeconds = parseVideoPosition(start);
    const firstBeatSeconds = parseVideoPosition(first);
    const offsetMs = Number(offset);
    if (!chosen || startSeconds === null || firstBeatSeconds === null ||
        !/^[+-]?\d{1,3}$/.test(offset.trim()) || Math.abs(offsetMs) > 500) {
      setError(tr("영상과 두 위치를 확인하세요. 보정 범위는 −500~+500 ms입니다.", "Check the clip and both positions. Offset range: −500 to +500 ms."));
      return;
    }
    const same = chosen.kind !== "youtube" || (source?.kind === "youtube" && chosen.videoId === source.videoId);
    if (same && reading.duration && (startSeconds >= reading.duration || firstBeatSeconds >= reading.duration)) {
      setError(tr("연습 시작과 첫 박을 영상 길이 안에서 지정하세요.", "Set the practice start and first beat within the video."));
      return;
    }
    if (chosen.kind === "file" && draftAsset.current === chosen.assetId) draftAsset.current = null;
    driver.current?.pause();
    onSave({ source: chosen, startSeconds, firstBeatSeconds, countInMeasures: count, offsetMs });
  };
  const input = { color: C.text, borderColor: C.border, backgroundColor: C.background };
  const close = () => { driver.current?.pause(); onClose(); };
  const positionField = (name: string, value: string, setter: (v: string) => void, id: string, useNow: string) => <View style={{ gap: 4, flexGrow: 1 }}>
    <Text style={{ color: C.textSecondary }}>{name}</Text>
    <TextInput testID={id} accessibilityLabel={name} value={value} onChangeText={setter}
      placeholder="0:42" placeholderTextColor={C.textTertiary} style={[s.input, input]} />
    <Button text={useNow} disabled={!reading.duration} onPress={() => setter(formatVideoPosition(reading.seconds))} />
  </View>;
  return <Modal visible transparent onRequestClose={close} animationType="fade">
    <View style={s.overlay}>
      <View style={[s.card, { backgroundColor: C.background, borderColor: C.border }]}>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontSize: 19, fontWeight: "700" }}>{tr("영상 첨부", "Video attachment")}</Text>
            <Text style={{ color: C.textSecondary }} numberOfLines={1}>{label}</Text>
          </View>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel={tr("닫기", "Close")} hitSlop={10}>
            <Ionicons name="close" size={24} color={C.textSecondary} />
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ minHeight: 0 }} contentContainerStyle={{ gap: 12 }} >
          <View style={s.row}>
            <TextInput testID="note-video-link" accessibilityLabel={tr("유튜브 링크", "YouTube link")} value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false}
              placeholder={tr("유튜브 링크", "YouTube link")} placeholderTextColor={C.textTertiary} style={[s.input, input, { flex: 1 }]} />
            <Button text={tr("링크 미리보기", "Preview link")} testID="note-video-preview-link" onPress={applyLink} />
          </View>
          <Button text={picking ? tr("가져오는 중…", "Importing…") : tr("영상 파일 선택", "Choose video file")} testID="note-video-pick" disabled={picking} onPress={() => { void pick(); }} />
          {source && <>
            <View style={{ height: 220 }}><NoteVideoPlayer source={source} onDriver={setDriver} onReading={setReading} /></View>
            {source.kind === "file" && <View>
              <Text style={{ color: C.textSecondary }} numberOfLines={1}>{source.name}</Text>
              <Text style={{ color: C.textTertiary, fontSize: 12 }}>
                {tr("이 영상 파일은 이 기기에만 저장되며 백업에 포함되지 않아요.", "This video file stays on this device and is not included in backups.")}
              </Text>
            </View>}
            <Button text={reading.phase === "playing" ? tr("일시정지", "Pause preview") : tr("영상 미리 재생", "Play preview")}
              disabled={["loading", "buffering", "error"].includes(reading.phase)}
              onPress={() => reading.phase === "playing" ? driver.current?.pause() : driver.current?.play()} />
            <Timeline reading={reading} seek={(sec) => driver.current?.seek(Math.max(0, Math.min(reading.duration, sec)))} />
            {(reading.phase === "error" || reading.phase === "blocked") && <Text style={{ color: C.danger }}>
              {reading.phase === "blocked" ? tr("자동재생이 차단됐어요. 영상에서 직접 재생해 보세요.", "Autoplay was blocked. Try playing directly in the player.") :
                tr("이 영상을 재생할 수 없어요.", "This video could not be played.")}
            </Text>}
            {source.kind === "youtube" && <OpenYouTube source={source} />}
          </>}
          <View style={[s.row, { flexWrap: "wrap", alignItems: "stretch" }]}>
            {positionField(tr("연습 시작", "Practice start"), start, setStart, "note-video-start", tr("현재 위치를 연습 시작으로", "Use current time as start"))}
            {positionField(tr("첫 박", "First beat"), first, setFirst, "note-video-first-beat", tr("현재 위치를 첫 박으로", "Use current time as first beat"))}
          </View>
          <Text style={{ color: C.textSecondary }}>{tr("예비박 · 영상 재생 전, 큐 항목의 템포로", "Count-in · before video, at the queue item's tempo")}</Text>
          <View style={s.row}>{([0, 1, 2] as const).map((n) => <Button key={n} selected={count === n}
            text={n === 0 ? tr("끔", "Off") : tr(`${n}마디`, `${n} ${n === 1 ? "bar" : "bars"}`)} testID={`note-video-count-${n}`} onPress={() => setCount(n)} />)}</View>
          <Text style={{ color: C.textSecondary }}>{tr("클릭 보정 (ms) · 음수는 앞당김, 양수는 늦춤", "Click offset (ms) · negative earlier, positive later")}</Text>
          <TextInput testID="note-video-offset" accessibilityLabel={tr("클릭 보정", "Click offset")} value={offset} onChangeText={setOffset} keyboardType="numbers-and-punctuation" style={[s.input, input]} />
          {error ? <Text accessibilityRole="alert" style={{ color: C.danger }}>{error}</Text> : null}
        </ScrollView>
        <View style={[s.row, { justifyContent: "space-between" }]}>
          {video ? <Button text={tr("영상 제거", "Remove video")} onPress={() => { driver.current?.pause(); onSave(undefined); }} /> : <View />}
          <Button text={tr("큐에 적용", "Apply to queue")} testID="note-video-apply" selected disabled={picking} onPress={save} />
        </View>
      </View>
    </View>
  </Modal>;
}

export function NoteVideoStage({ session, driver, reading, seek, children }: {
  session: NoteVideoPlayback;
  driver: (key: number, handle: VideoDriver | null) => void;
  reading: (key: number, state: VideoReading) => void;
  seek: (seconds: number) => void;
  children: React.ReactNode;
}) {
  const tr = useVideoText();
  const { colors: C } = useTheme();
  const key = session.key;
  const setDriver = useCallback((handle: VideoDriver | null) => driver(key, handle), [driver, key]);
  const setReading = useCallback((state: VideoReading) => reading(key, state), [reading, key]);
  const phase = session.reading.phase;
  const status = session.countBeat !== null
    ? tr(`예비박 ${session.countBeat}`, `Count-in ${session.countBeat}`)
    : phase === "blocked" ? tr("재생이 차단됐어요. 재생 버튼이나 영상의 ▶를 눌러 주세요.", "Playback was blocked. Press play here or in the video.")
    : phase === "error" ? tr("영상을 재생할 수 없어요. 링크·파일·시작 위치를 확인하세요.", "Could not play the video. Check the source and start time.")
    : phase === "loading" || phase === "buffering" || phase === "seeking" ? tr("영상 준비 중…", "Waiting for video…")
    : session.paused || phase === "paused" ? tr("일시정지", "Paused") : null;
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, gap: 8, padding: 10 }} testID="note-video-stage">
    <View style={{ flex: 1, minHeight: 200 }}><NoteVideoPlayer source={session.video.source} onDriver={setDriver} onReading={setReading} /></View>
    {status && <Text testID="note-video-status" accessibilityLiveRegion="polite" style={{ color: phase === "error" ? C.danger : C.textSecondary }}>{status}</Text>}
    <Timeline reading={session.reading} seek={seek} disabled={session.countBeat !== null} />
    {children}
    {(phase === "error" || phase === "blocked") && <OpenYouTube source={session.video.source} />}
  </ScrollView>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 12, backgroundColor: "#0009" },
  card: { width: "100%", maxWidth: 560, maxHeight: "94%", borderWidth: 1, borderRadius: 16, padding: 14, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  button: { minHeight: 36, paddingHorizontal: 10, paddingVertical: 7, justifyContent: "center", alignItems: "center", borderWidth: 1, borderRadius: 8 },
  input: { minHeight: 38, minWidth: 64, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, fontSize: 14 },
});
