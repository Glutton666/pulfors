// ============================================================
// useScorePlayback — 악보 재생 상태 관리 훅 (오디오 연결 포함)
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { Alert, Platform } from "react-native";
import { buildPlayTimeline, findCurrentEvent, totalTimelineMs } from "@/lib/score-playback";
import type { PlayEvent } from "@/lib/score-playback";
import type { ScoreDocument, DrumType } from "@/lib/score-types";
import { captureException } from "@/lib/error-tracking";
import {
  getPrepareBatchSize,
  prepareScoreAudio,
  prepareDrumAudio,
  scheduleMeasureNotes,
  stopAllScoreNotes,
} from "@/lib/score-audio";

// RAF는 ~16ms마다 실행되므로 50ms 이내 지각 음표는 즉시 발음 허용
const LATE_THRESHOLD_MS = 50;

export interface ScorePlaybackState {
  isPlaying: boolean;
  /** 네이티브에서 WAV 파일 준비 중일 때 true */
  isPreparing: boolean;
  /** 준비 진행 상황 — 준비 중일 때만 non-null */
  prepareProgress: { done: number; total: number } | null;
  /** 현재 재생 중인 악보 내 마디 인덱스 */
  currentMeasureIdx: number;
  /** 현재 마디 내 Playhead 위치 (0=시작, 1=끝) */
  playheadFraction: number;
  /** 전체 재생 시간(ms) */
  totalMs: number;
  /** 현재 마디에 연결된 연습 항목 ID (linkedPracticeEntryId), 없으면 undefined */
  currentLinkedEntryId: string | undefined;
  play: () => void;
  pause: () => void;
  stop: () => void;
}

export function useScorePlayback(doc: ScoreDocument): ScorePlaybackState {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepareProgress, setPrepareProgress] = useState<{ done: number; total: number } | null>(null);
  const [currentMeasureIdx, setCurrentMeasureIdx] = useState(0);
  const [playheadFraction, setPlayheadFraction] = useState(0);
  const [totalMs, setTotalMs] = useState(0);
  const [currentLinkedEntryId, setCurrentLinkedEntryId] = useState<string | undefined>(undefined);

  const timelineRef = useRef<PlayEvent[]>([]);
  const isPlayingRef = useRef(false);
  const startWallRef = useRef(0);     // Date.now() at play/resume
  const resumeOffsetRef = useRef(0);  // elapsed ms at pause
  const rafRef = useRef<number | null>(null);
  // 준비 요청 세션 ID — stop/unmount 시 증가시켜 stale callback 무효화
  const prepareSessionRef = useRef(0);

  // 악기 변경 시 재준비를 위한 보조 refs
  // - prepareParamsRef: 준비 중일 때 non-null (음표-악기 쌍 목록 보관)
  // - startRafRef: 준비 완료 후 호출할 startRaf 함수
  const prepareParamsRef = useRef<{
    noteInstrumentPairs: { midi: number; instrumentId: string }[];
    drumTypes: DrumType[];
  } | null>(null);
  const startRafRef = useRef<(() => void) | null>(null);
  // prepare 완료 후 true — pause→play 시 재준비 건너뜀. stop()/doc 변경 시 리셋.
  const isAudioReadyRef = useRef(false);

  // 오디오: 마디 변경 감지용 seqIdx 추적
  const lastSeqIdxRef = useRef(-1);

  // muteAudio 를 ref로 유지해 tick 클로저에서 최신값 읽기
  const muteAudioRef = useRef(doc.playbackSettings?.muteAudio ?? false);
  useEffect(() => {
    muteAudioRef.current = doc.playbackSettings?.muteAudio ?? false;
  }, [doc.playbackSettings?.muteAudio]);

  // doc을 ref로 유지해 tick 클로저에서 최신 마디 정보 접근
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const tick = useCallback(() => {
    if (!isPlayingRef.current) return;

    const elapsed = Date.now() - startWallRef.current + resumeOffsetRef.current;
    const timeline = timelineRef.current;
    const total = totalTimelineMs(timeline);

    if (total > 0 && elapsed >= total) {
      // 재생 완료
      isPlayingRef.current = false;
      stopAllScoreNotes();
      lastSeqIdxRef.current = -1;
      setIsPlaying(false);
      setCurrentMeasureIdx(0);
      setPlayheadFraction(0);
      setCurrentLinkedEntryId(undefined);
      resumeOffsetRef.current = 0;
      return;
    }

    const { event, fraction } = findCurrentEvent(timeline, elapsed);
    if (event) {
      // 새 마디 진입 감지 → 음표 스케줄링 + linkedPracticeEntryId 갱신
      if (event.seqIdx !== lastSeqIdxRef.current) {
        lastSeqIdxRef.current = event.seqIdx;

        if (!muteAudioRef.current && event.notes.length > 0) {
          const elapsedInMeasure = elapsed - event.startTimeMs;
          const adjustedNotes = event.notes
            .filter((n) => n.startOffsetMs >= elapsedInMeasure - LATE_THRESHOLD_MS)
            .map((n) => ({
              ...n,
              startOffsetMs: Math.max(0, n.startOffsetMs - elapsedInMeasure),
            }));
          if (adjustedNotes.length > 0) {
            scheduleMeasureNotes(adjustedNotes, undefined, event.instrumentId);
          }
        }

        // 현재 마디의 연결된 연습 항목 ID 추적
        const measures = docRef.current.parts[0]?.measures;
        const linkedId = measures?.[event.measureIdx]?.linkedPracticeEntryId ?? undefined;
        setCurrentLinkedEntryId(linkedId || undefined);
      }

      setCurrentMeasureIdx(event.measureIdx);
      setPlayheadFraction(fraction);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  /** 내부 prepare 헬퍼 — play()와 악기 변경 effect 양쪽에서 호출 */
  const _runPrepare = useCallback((
    noteInstrumentPairs: { midi: number; instrumentId: string }[],
    drumTypes: DrumType[],
  ) => {
    const sessionId = ++prepareSessionRef.current;
    // Compute unique valid MIDI count for the initial progress display.
    // In multi-instrument mode the true total is determined by unique
    // (midi, waveform) pairs, but we approximate here for the UI counter;
    // prepareScoreAudio reports the exact total via the progress callback.
    const allMidi = noteInstrumentPairs.map((p) => p.midi);
    const total = [...new Set(allMidi)].filter((m) => m >= 21 && m <= 108).length;
    setIsPreparing(true);
    setPrepareProgress({ done: 0, total });
    prepareParamsRef.current = { noteInstrumentPairs, drumTypes };

    Promise.all([
      prepareScoreAudio(
        [],
        (done, tot) => {
          if (prepareSessionRef.current !== sessionId) return;
          setPrepareProgress({ done, total: tot });
        },
        getPrepareBatchSize(),
        undefined,
        noteInstrumentPairs,
      ),
      prepareDrumAudio(drumTypes),
    ])
      .then(() => {
        if (prepareSessionRef.current !== sessionId) return;
        prepareParamsRef.current = null;
        setIsPreparing(false);
        setPrepareProgress(null);
        isAudioReadyRef.current = true;
        startRafRef.current?.();
      })
      .catch((error: unknown) => {
        if (prepareSessionRef.current !== sessionId) return;
        prepareParamsRef.current = null;
        startRafRef.current = null;
        setIsPreparing(false);
        setPrepareProgress(null);
        // A failed preparation is not a usable cache. In particular, do not
        // start the playhead: doing so makes silent playback look successful.
        isAudioReadyRef.current = false;
        isPlayingRef.current = false;
        stopAllScoreNotes();
        captureException(error, { category: "score-playback", operation: "prepare-audio" });
        Alert.alert(
          "재생 오류",
          "악보 오디오를 준비하지 못했습니다. 다시 시도해 주세요.",
        );
      });
  }, []);

  const play = useCallback(() => {
    if (isPlayingRef.current || isPreparing) return;
    const timeline = buildPlayTimeline(doc);
    timelineRef.current = timeline;
    setTotalMs(totalTimelineMs(timeline));

    const startRaf = () => {
      lastSeqIdxRef.current = -1;
      startWallRef.current = Date.now();
      isPlayingRef.current = true;
      setIsPlaying(true);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    startRafRef.current = startRaf;

    if (Platform.OS !== "web" && timeline.length > 0) {
      // 네이티브: WAV 파일 준비가 완료된 뒤 재생 시작
      // (pause→play 재개 시에는 isAudioReadyRef가 true → 재준비 건너뜀)
      // 다악기 악보를 지원하기 위해 각 음표를 해당 파트 악기와 함께 수집합니다.
      const noteInstrumentPairs: { midi: number; instrumentId: string }[] = [];
      const drumTypes: DrumType[] = [];
      for (const ev of timeline) {
        for (const n of ev.notes) {
          if (n.drumType) {
            drumTypes.push(n.drumType);
            continue;
          }
          // 다악기 악보: n.instrumentId(파트별 태깅) 우선 사용
          noteInstrumentPairs.push({ midi: n.midiNote, instrumentId: n.instrumentId ?? ev.instrumentId });
        }
      }
      if ((noteInstrumentPairs.length > 0 || drumTypes.length > 0) && !isAudioReadyRef.current) {
        _runPrepare(noteInstrumentPairs, drumTypes);
        return;
      }
    }

    startRaf();
  }, [doc, tick, isPreparing, _runPrepare]);

  const pause = useCallback(() => {
    if (!isPlayingRef.current) return;
    resumeOffsetRef.current = Date.now() - startWallRef.current + resumeOffsetRef.current;
    isPlayingRef.current = false;
    stopAllScoreNotes();
    lastSeqIdxRef.current = -1;
    setIsPlaying(false);
    setCurrentLinkedEntryId(undefined);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    // 진행 중인 prepare 비동기 작업을 무효화
    prepareSessionRef.current++;
    prepareParamsRef.current = null;
    startRafRef.current = null;
    isAudioReadyRef.current = false;
    timelineRef.current = [];
    setIsPreparing(false);
    setPrepareProgress(null);
    isPlayingRef.current = false;
    stopAllScoreNotes();
    lastSeqIdxRef.current = -1;
    setIsPlaying(false);
    setCurrentMeasureIdx(0);
    setPlayheadFraction(0);
    setCurrentLinkedEntryId(undefined);
    setTotalMs(0);
    resumeOffsetRef.current = 0;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // 다른 악보로 전환 시 재생 중지
  const docIdRef = useRef(doc.id);
  useEffect(() => {
    if (docIdRef.current === doc.id) return;
    docIdRef.current = doc.id;
    // The content-signature effect below rebuilds an in-flight preparation
    // against the new document before allowing its completion to start.
    if (prepareParamsRef.current) return;
    stop();
  }, [doc.id, stop]);

  // 재생에 영향을 주는 악보 내용이 바뀌면, 마디 수가 같아도 준비된
  // 오디오와 타임라인을 폐기합니다. 메타데이터/표시 설정 변경은 제외해
  // pause → resume이 불필요하게 재준비되지 않도록 합니다.
  const playbackSignature = JSON.stringify({
    parts: doc.parts,
    bpm: doc.bpm,
    timeSignature: doc.timeSignature,
    keySignature: doc.keySignature,
  });
  const playbackSignatureRef = useRef(playbackSignature);
  useEffect(() => {
    if (playbackSignatureRef.current === playbackSignature) return;
    playbackSignatureRef.current = playbackSignature;

    const preparingReplacement = Boolean(prepareParamsRef.current);
    // Publish the replacement timeline before starting the replacement
    // preparation. Its completion callback can start RAF immediately, so the
    // ref must never briefly point at an empty timeline for that session.
    const freshTimeline = preparingReplacement ? buildPlayTimeline(doc) : null;
    isAudioReadyRef.current = false;
    timelineRef.current = freshTimeline ?? [];
    lastSeqIdxRef.current = -1;
    resumeOffsetRef.current = 0;
    setTotalMs(freshTimeline ? totalTimelineMs(freshTimeline) : 0);

    if (preparingReplacement && freshTimeline) {
      // In-flight preparation must use the edited notes/timing/instrument.
      // Starting a new session invalidates the old promise's completion.
       const freshPairs: { midi: number; instrumentId: string }[] = [];
      const freshDrumTypes: DrumType[] = [];
      for (const ev of freshTimeline) {
        for (const n of ev.notes) {
          if (n.drumType) {
            freshDrumTypes.push(n.drumType);
            continue;
          }
          freshPairs.push({ midi: n.midiNote, instrumentId: n.instrumentId ?? ev.instrumentId });
        }
      }
      _runPrepare(freshPairs, freshDrumTypes);
    } else if (isPlayingRef.current) {
      stop();
    }
  }, [doc, playbackSignature, _runPrepare, stop]);

  // unmount cleanup
  useEffect(() => {
    const prepareSessionRefForCleanup = prepareSessionRef;
    return () => {
      // 진행 중인 prepare 비동기 작업 무효화
      prepareSessionRefForCleanup.current++;
      prepareParamsRef.current = null;
      isPlayingRef.current = false;
      stopAllScoreNotes();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { isPlaying, isPreparing, prepareProgress, currentMeasureIdx, playheadFraction, totalMs, currentLinkedEntryId, play, pause, stop };
}
