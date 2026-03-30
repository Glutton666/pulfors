import { Dimensions, useWindowDimensions } from "react-native";
import { useMemo } from "react";

const BASE_WIDTH = 375;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const IS_TABLET = Math.min(SCREEN_WIDTH, SCREEN_HEIGHT) >= 600;

const scale = IS_TABLET
  ? Math.min(SCREEN_WIDTH / BASE_WIDTH, 2.2)
  : Math.min(SCREEN_WIDTH / BASE_WIDTH, 1.6);

const moderateScale = (size: number, factor = 0.5) =>
  size + (scale - 1) * size * factor;

const CONTENT_MAX_WIDTH = IS_TABLET ? 560 : undefined;

export interface ScaleValues {
  ms: (size: number, factor?: number) => number;
  screenWidth: number;
  screenHeight: number;
  minDim: number;
  maxDim: number;
  isTablet: boolean;
  isLandscape: boolean;
  scale: number;
  dialSize: number;
  dialRadius: number;
  dotRadiusFromCenter: number;
  dotSize: number;
  contentMaxWidth: number | undefined;
}

export function useScale(): ScaleValues {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const minDim = Math.min(width, height);
    const maxDim = Math.max(width, height);
    const isTablet = minDim >= 600;
    const isLandscape = width > height;

    const scaleBase = isLandscape ? minDim : width;
    const s = isTablet
      ? Math.min(scaleBase / BASE_WIDTH, 2.2)
      : Math.min(scaleBase / BASE_WIDTH, 1.6);

    const ms = (size: number, factor = 0.5): number =>
      size + (s - 1) * size * factor;

    const extraUI = 50;
    const dialSize = isTablet
      ? Math.min(minDim - 80, 420)
      : isLandscape
        ? Math.min(height * 0.7, ms(280), height - extraUI - 60)
        : Math.min(width - 48, ms(300), height * 0.45);

    const dialRadius = dialSize / 2;
    const dotRadiusFromCenter = dialRadius - ms(30, 0.4);
    const dotSize = isTablet ? ms(40, 0.4) : ms(34, 0.4);
    const contentMaxWidth = isTablet ? 560 : undefined;

    return {
      ms,
      screenWidth: width,
      screenHeight: height,
      minDim,
      maxDim,
      isTablet,
      isLandscape,
      scale: s,
      dialSize,
      dialRadius,
      dotRadiusFromCenter,
      dotSize,
      contentMaxWidth,
    };
  }, [width, height]);
}

export { scale, moderateScale, SCREEN_WIDTH, SCREEN_HEIGHT, IS_TABLET, CONTENT_MAX_WIDTH };
