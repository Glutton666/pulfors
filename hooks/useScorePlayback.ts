// ============================================================
// useScorePlayback — 악보 재생 상태 관리 훅 (오디오 연결 포함)
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { buildPlayTimeline, findCurrentEvent, totalTimelineMs } from "@/lib/score-playback";
import type { PlayEvent } from "@/lib/score-playback";
import type { ScoreDocument } from "@/lib/score-types";
import {
  getPrepareBatchSize,
  prepareScoreAudio,
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

  const timelineRef = useRef<PlayEvent[]>([]);
  const isPlayingRef = useRef(false);
  const startWallRef = useRef(0);     // Date.now() at play/resume
  const resumeOffsetRef = useRef(0);  // elapsed ms at pause
  const rafRef = useRef<number | null>(null);
  // 준비 요청 세션 ID — stop/unmount 시 증가시켜 stale callback 무효화
  const prepareSessionRef = useRef(0);

  // 악기 변경 시 재준비를 위한 보조 refs
  // - prepareParamsRef: 준비 중일 때 non-null (MIDI 목록 보관)
  // - startRafRef: 준비 완료 후 호출할 startRaf 함수
  const prepareParamsRef = useRef<{ allMidi: number[] } | null>(null);
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
      resumeOffsetRef.current = 0;
      return;
    }

    const { event, fraction } = findCurrentEvent(timeline, elapsed);
    if (event) {
      // 새 마디 진입 감지 → 음표 스케줄링
      if (event.seqIdx !== lastSeqIdxRef.current) {
        lastSeqIdxRef.current = event.seqIdx;

        if (!muteAudioRef.current && !event.isPercussion && event.notes.length > 0) {
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
      }

      setCurrentMeasureIdx(event.measureIdx);
      setPlayheadFraction(fraction);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  /** 내부 prepare 헬퍼 — play()와 악기 변경 effect 양쪽에서 호출 */
  const _runPrepare = useCallback((allMidi: number[], instrumentId: string | undefined) => {
    const sessionId = ++prepareSessionRef.current;
    const total = [...new Set(allMidi)].filter((m) => m >= 21 && m <= 108).length;
    setIsPreparing(true);
    setPrepareProgress({ done: 0, total });
    prepareParamsRef.current = { allMidi };

    prepareScoreAudio(
      allMidi,
      (done, tot) => {
        if (prepareSessionRef.current !== sessionId) return;
        setPrepareProgress({ done, total: tot });
      },
      getPrepareBatchSize(),
      instrumentId,
    )
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
      const allMidi: number[] = [];
      for (const ev of timeline) {
        for (const n of ev.notes) allMidi.push(n.midiNote);
      }
      if (allMidi.length > 0 && !isAudioReadyRef.current) {
        _runPrepare(allMidi, doc.parts[0]?.instrumentId);
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
    if (!prepareParamsRef.current) return;
    isAudioReadyRef.current = false; // 악기 변경 시 재준비 필요
    const { allMidi } = prepareParamsRef.current;
    _runPrepare(allMidi, partInstrumentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partInstrumentId]);

  const pause = useCallback(() => {
    if (!isPlayingRef.current) return;
    resumeOffsetRef.current = Date.now() - startWallRef.current + resumeOffsetRef.current;
    isPlayingRef.current = false;
    stopAllScoreNotes();
    lastSeqIdxRef.current = -1;
    setIsPlaying(false);
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

  return { isPlaying, isPreparing, prepareProgress, currentMeasureIdx, playheadFraction, totalMs, play, pause, stop };
}
