import { useWindowDimensions } from "react-native";
import { useScale } from "@/lib/scale";

export interface ModalCardLayout {
  cardWidth: number;
  cardMaxHeight: number;
  isLandscape: boolean;
  isTablet: boolean;
  winW: number;
  winH: number;
}

export function useModalCardLayout(opts: {
  maxWidth?: number;
  landscapeMaxWidth?: number;
  maxHeightRatio?: number;
} = {}): ModalCardLayout {
  const { width: winW, height: winH } = useWindowDimensions();
  const { isTablet, isLandscape } = useScale();

  const maxWidth = opts.maxWidth ?? (isTablet ? 520 : 480);
  const landscapeMaxWidth = opts.landscapeMaxWidth ?? Math.min(winW * 0.85, 600);
  const maxHeightRatio = opts.maxHeightRatio ?? (isLandscape ? 0.88 : 0.85);

  const cardWidth = isLandscape ? landscapeMaxWidth : maxWidth;
  const cardMaxHeight = Math.round(winH * maxHeightRatio);

  return { cardWidth, cardMaxHeight, isLandscape, isTablet, winW, winH };
}
