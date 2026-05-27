// ============================================================
// useScorePlayback — 악보 재생 상태 관리 훅
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";
import { buildPlayTimeline, findCurrentEvent, totalTimelineMs } from "@/lib/score-playback";
import type { PlayEvent } from "@/lib/score-playback";
import type { ScoreDocument } from "@/lib/score-types";

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
  const startWallRef = useRef(0);  // Date.now() at play/resume
  const resumeOffsetRef = useRef(0); // elapsed ms at pause
  const rafRef = useRef<number | null>(null);

  const tick = useCallback(() => {
    if (!isPlayingRef.current) return;

    const elapsed = Date.now() - startWallRef.current + resumeOffsetRef.current;
    const timeline = timelineRef.current;
    const total = totalTimelineMs(timeline);

    if (total > 0 && elapsed >= total) {
      // 재생 완료
      isPlayingRef.current = false;
      setIsPlaying(false);
      setCurrentMeasureIdx(0);
      setPlayheadFraction(0);
      resumeOffsetRef.current = 0;
      return;
    }

    const { event, fraction } = findCurrentEvent(timeline, elapsed);
    if (event) {
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
    setIsPlaying(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    isPlayingRef.current = false;
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
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { isPlaying, currentMeasureIdx, playheadFraction, totalMs, play, pause, stop };
}
