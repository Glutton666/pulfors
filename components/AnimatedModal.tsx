import React, { useEffect, useRef, useState } from "react";
import { Modal, ModalProps } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

const FADE_MS = 150;

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
