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

    if (visible) {
      setNativeVisible(true);
      opacity.value = withTiming(1, { duration: FADE_MS });
    } else {
      opacity.value = withTiming(0, { duration: FADE_MS }, (finished) => {
        if (finished && gen === generationRef.current) {
          runOnJS(setNativeVisible)(false);
        }
      });
    }
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
    }
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
