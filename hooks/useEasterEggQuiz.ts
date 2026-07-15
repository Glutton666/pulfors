import { useEffect, useRef, useState } from "react";

/**
 * app/index.tsx에서 분리한 "이스터에그"(BPM 맞추기 미니게임) 상태 묶음.
 * 동작 변경 없이 상태 선언만 이동한 것으로, 실제 게임 로직(흔들기 감지,
 * 정답 판정 등)은 여전히 app/index.tsx에서 engineRef/bpmRef를 참조하며 처리한다.
 */
export function useEasterEggQuiz() {
  const [easterEggActive, setEasterEggActive] = useState(false);
  const [easterEggShakeCount, setEasterEggShakeCount] = useState(0);
  const [easterEggSuccessCount, setEasterEggSuccessCount] = useState(0);
  const [easterEggRevealBpm, setEasterEggRevealBpm] = useState<number | null>(null);
  const [easterEggGiveUpMode, setEasterEggGiveUpMode] = useState(false);
  const [easterEggHintDirection, setEasterEggHintDirection] = useState<"up" | "down" | null>(null);
  const [easterEggApplyBpm, setEasterEggApplyBpm] = useState(false);
  const easterEggPrevBpmRef = useRef(120);
  const easterEggActualBpmRef = useRef(120);
  const easterEggActiveRef = useRef(false);
  const easterEggApplyBpmRef = useRef(false);
  useEffect(() => { easterEggActiveRef.current = easterEggActive; }, [easterEggActive]);
  useEffect(() => { easterEggApplyBpmRef.current = easterEggApplyBpm; }, [easterEggApplyBpm]);

  return {
    easterEggActive,
    setEasterEggActive,
    easterEggShakeCount,
    setEasterEggShakeCount,
    easterEggSuccessCount,
    setEasterEggSuccessCount,
    easterEggRevealBpm,
    setEasterEggRevealBpm,
    easterEggGiveUpMode,
    setEasterEggGiveUpMode,
    easterEggHintDirection,
    setEasterEggHintDirection,
    easterEggApplyBpm,
    setEasterEggApplyBpm,
    easterEggApplyBpmRef,
    easterEggPrevBpmRef,
    easterEggActualBpmRef,
    easterEggActiveRef,
  };
}

export type EasterEggQuizState = ReturnType<typeof useEasterEggQuiz>;
