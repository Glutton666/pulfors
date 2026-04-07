import { Dimensions, Platform, useWindowDimensions } from "react-native";
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

const WEB_INSET_VERT = Platform.OS === "web" ? 101 : 0;

export function useScale(): ScaleValues {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const minDim = Math.min(width, height);
    const maxDim = Math.max(width, height);
    const isTablet = minDim >= 600;
    const isLandscape = width > height;
    const isWeb = Platform.OS === "web";

    const scaleBase = isLandscape ? minDim : width;
    const maxScale = isTablet ? (isWeb ? 4.5 : 2.4) : 1.6;
    const s = Math.min(scaleBase / BASE_WIDTH, maxScale);

    const ms = (size: number, factor = 0.5): number =>
      size + (s - 1) * size * factor;

    const safeH = height - WEB_INSET_VERT;
    const paddingVert = isLandscape ? 16 : 24;
    const availH = safeH - paddingVert;

    let dialSize: number;
    if (isTablet) {
      const maxDial = isWeb ? Math.min(minDim * 0.65, 1200) : 520;
      dialSize = Math.min(minDim - 80, maxDial, availH * 0.55);
    } else if (isLandscape) {
      const padH = ms(16, 0.3) * 2;
      const leftColW = (width - padH) * 5 / 8;
      const modeBtnSpace = 52;
      const maxByWidth = leftColW - modeBtnSpace;
      dialSize = Math.min(
        availH - 10,
        maxByWidth,
        ms(280),
        height * 0.7
      );
    } else {
      const fixedMiddle = 80;
      const flexArea = availH - fixedMiddle;
      const dialAreaH = flexArea * 5 / 7;
      dialSize = Math.min(
        width - 48,
        ms(300),
        dialAreaH,
        height * 0.45
      );
    }
    dialSize = Math.max(dialSize, 120);

    const dialRadius = dialSize / 2;
    const dotRadiusFromCenter = dialRadius - ms(30, 0.4);
    const dotSize = isTablet ? Math.max(ms(40, 0.4), dialSize * 0.1) : ms(34, 0.4);

    let contentMaxWidth: number | undefined;
    if (isTablet) {
      if (isWeb) {
        contentMaxWidth = Math.min(Math.max(560, width * 0.85), 1400);
      } else {
        contentMaxWidth = 560;
      }
    }

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
