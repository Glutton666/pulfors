import React, { useEffect, useRef, useState } from "react";
import { Modal, ModalProps, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

const FADE_MS = 150;
const SLIDE_MS = 200;

export type AnimatedModalProps = Omit<ModalProps, "animationType"> & {
  visible: boolean;
};

export function AnimatedModal({
  visible,
  children,
  onRequestClose,
  ...rest
}: AnimatedModalProps) {
  const opacity = useSharedValue(visible ? 1 : 0);
  const [nativeVisible, setNativeVisible] = useState(visible);
  const generationRef = useRef(0);

  useEffect(() => {
    const gen = ++generationRef.current;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    if (visible) {
      setNativeVisible(true);
      opacity.value = withTiming(1, { duration: FADE_MS });
    } else {
      opacity.value = withTiming(0, { duration: FADE_MS }, (finished) => {
        if (finished && gen === generationRef.current) {
          runOnJS(setNativeVisible)(false);
        }
      });
      // 안전장치: withTiming의 finished 콜백은 애니메이션이 중간에 끊기면
      // (예: visible이 다시 바뀌어 값이 재대입되거나, 앱이 백그라운드로
      // 전환되는 등) false로 온다. 그 경우 위 분기가 실행되지 않아
      // setNativeVisible(false)가 영원히 호출되지 않고, 네이티브 Modal이
      // 화면엔 안 보이지만 계속 떠 있는 상태로 남아 뒤로가기/터치/edge-swipe
      // 제스처를 계속 가로챌 수 있다 (2026-08-24 실기기에서 재현·확인).
      // 애니메이션이 정상 완료됐는지와 무관하게 일정 시간 후엔 반드시 닫는다.
      fallbackTimer = setTimeout(() => {
        if (gen === generationRef.current) setNativeVisible(false);
      }, FADE_MS + 50);
    }

    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    flex: 1,
    opacity: opacity.value,
  }));

  return (
    <Modal
      visible={nativeVisible}
      animationType="none"
      onRequestClose={onRequestClose}
      {...rest}
    >
      <Animated.View style={animStyle}>{children}</Animated.View>
    </Modal>
  );
}

export type AnimatedSlideModalProps = Omit<ModalProps, "animationType"> & {
  visible: boolean;
  duration?: number;
  enterEasing?: (t: number) => number;
  exitEasing?: (t: number) => number;
};

export function AnimatedSlideModal({
  visible,
  children,
  onRequestClose,
  duration = SLIDE_MS,
  enterEasing = Easing.out(Easing.cubic),
  exitEasing = Easing.in(Easing.cubic),
  ...rest
}: AnimatedSlideModalProps) {
  const { height } = useWindowDimensions();
  const translateY = useSharedValue(visible ? 0 : height);
  const [nativeVisible, setNativeVisible] = useState(visible);
  const generationRef = useRef(0);

  useEffect(() => {
    const gen = ++generationRef.current;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    if (visible) {
      translateY.value = height;
      setNativeVisible(true);
      translateY.value = withTiming(0, {
        duration,
        easing: enterEasing,
      });
    } else {
      translateY.value = withTiming(
        height,
        { duration, easing: exitEasing },
        (finished) => {
          if (finished && gen === generationRef.current) {
            runOnJS(setNativeVisible)(false);
          }
        }
      );
      // 안전장치: AnimatedModal과 동일한 이유로, finished가 false로 오는
      // 경우(애니메이션 중단)에 대비해 일정 시간 후 무조건 닫는다.
      fallbackTimer = setTimeout(() => {
        if (gen === generationRef.current) setNativeVisible(false);
      }, duration + 50);
    }

    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [visible, height, duration, enterEasing, exitEasing]);

  const animStyle = useAnimatedStyle(() => ({
    flex: 1,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal
      visible={nativeVisible}
      animationType="none"
      onRequestClose={onRequestClose}
      {...rest}
    >
      <Animated.View style={animStyle}>{children}</Animated.View>
    </Modal>
  );
}
