// ============================================================
// useScorePlayback — 악보 재생 상태 관리 훅 (오디오 연결 포함)
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { buildPlayTimeline, findCurrentEvent, totalTimelineMs } from "@/lib/score-playback";
import type { PlayEvent } from "@/lib/score-playback";
import type { ScoreDocument, DrumType } from "@/lib/score-types";
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
    noteInstrumentPairs: Array<{ midi: number; instrumentId: string }>;
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
    noteInstrumentPairs: Array<{ midi: number; instrumentId: string }>,
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
      .catch(() => {})
      .finally(() => {
        if (prepareSessionRef.current !== sessionId) return;
        prepareParamsRef.current = null;
        setIsPreparing(false);
        setPrepareProgress(null);
        isAudioReadyRef.current = true;
        startRafRef.current?.();
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
      const noteInstrumentPairs: Array<{ midi: number; instrumentId: string }> = [];
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

  // 준비 도중 악기가 바뀌면 새 악기로 다시 준비
  // - prepareParamsRef.current: null이면 준비 중이 아니므로 즉시 리턴
  // - 세션 ID 증가 → 이전 prepare의 .finally()가 startRaf를 호출하지 않음
  // - 새 prepare가 완료되면 startRafRef.current()로 재생 시작
  const partInstrumentId = doc.parts[0]?.instrumentId;
  useEffect(() => {
    // 악기 변경 시 항상 무효화 — idle/pause/완료 상태에서도 새 악기로 재준비 필요
    isAudioReadyRef.current = false;
    if (!prepareParamsRef.current) return;
    // 현재 doc 타임라인을 새로 빌드해 최신 instrumentId를 반영합니다.
    // (stale prepareParamsRef 재사용 시 이전 악기 ID가 그대로 남는 버그 수정)
    const freshTimeline = buildPlayTimeline(doc);
    const freshPairs: Array<{ midi: number; instrumentId: string }> = [];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partInstrumentId]);

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
    setIsPreparing(false);
    setPrepareProgress(null);
    isPlayingRef.current = false;
    stopAllScoreNotes();
    lastSeqIdxRef.current = -1;
    setIsPlaying(false);
    setCurrentMeasureIdx(0);
    setPlayheadFraction(0);
    setCurrentLinkedEntryId(undefined);
    resumeOffsetRef.current = 0;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // 다른 악보로 전환 시 재생 중지
  useEffect(() => {
    stop();
  }, [doc.id, stop]);

  // 재생 중 마디 수가 바뀌면 타임라인이 구식이 되므로 중지
  const measureCountRef = useRef(doc.parts[0]?.measures.length ?? 0);
  useEffect(() => {
    const newCount = doc.parts[0]?.measures.length ?? 0;
    if (measureCountRef.current !== newCount) {
      measureCountRef.current = newCount;
      if (isPlayingRef.current) stop();
    }
  });

  // unmount cleanup
  useEffect(() => {
    return () => {
      // 진행 중인 prepare 비동기 작업 무효화
      prepareSessionRef.current++;
      prepareParamsRef.current = null;
      isPlayingRef.current = false;
      stopAllScoreNotes();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { isPlaying, isPreparing, prepareProgress, currentMeasureIdx, playheadFraction, totalMs, currentLinkedEntryId, play, pause, stop };
}
