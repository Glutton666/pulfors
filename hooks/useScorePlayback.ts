// ============================================================
// useScorePlayback — 악보 재생 상태 관리 훅 (오디오 연결 포함)
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { buildPlayTimeline, findCurrentEvent, totalTimelineMs } from "@/lib/score-playback";
import type { PlayEvent } from "@/lib/score-playback";
import type { ScoreDocument } from "@/lib/score-types";
import {
  prepareScoreAudio,
  scheduleMeasureNotes,
  stopAllScoreNotes,
} from "@/lib/score-audio";

// RAF는 ~16ms마다 실행되므로 50ms 이내 지각 음표는 즉시 발음 허용
const LATE_THRESHOLD_MS = 50;

export interface ScorePlaybackState {
  isPlaying: boolean;
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
  const [currentMeasureIdx, setCurrentMeasureIdx] = useState(0);
  const [playheadFraction, setPlayheadFraction] = useState(0);
  const [totalMs, setTotalMs] = useState(0);

  const timelineRef = useRef<PlayEvent[]>([]);
  const isPlayingRef = useRef(false);
  const startWallRef = useRef(0);     // Date.now() at play/resume
  const resumeOffsetRef = useRef(0);  // elapsed ms at pause
  const rafRef = useRef<number | null>(null);

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
            scheduleMeasureNotes(adjustedNotes);
          }
        }
      }

      setCurrentMeasureIdx(event.measureIdx);
      setPlayheadFraction(fraction);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const play = useCallback(() => {
    if (isPlayingRef.current) return;
    const timeline = buildPlayTimeline(doc);
    timelineRef.current = timeline;
    setTotalMs(totalTimelineMs(timeline));

    // 네이티브: 음표 WAV 파일 미리 생성 (비동기, 재생 시작은 즉시)
    if (timeline.length > 0) {
      const allMidi: number[] = [];
      for (const ev of timeline) {
        for (const n of ev.notes) allMidi.push(n.midiNote);
      }
      if (allMidi.length > 0) {
        prepareScoreAudio(allMidi).catch(() => {});
      }
    }

    lastSeqIdxRef.current = -1;
    startWallRef.current = Date.now();
    isPlayingRef.current = true;
    setIsPlaying(true);

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, [doc, tick]);

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
      isPlayingRef.current = false;
      stopAllScoreNotes();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { isPlaying, currentMeasureIdx, playheadFraction, totalMs, play, pause, stop };
}
