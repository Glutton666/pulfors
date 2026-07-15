import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScale } from "@/lib/scale";

export interface ModalCardLayout {
  cardWidth: number;
  cardMaxHeight: number;
  isLandscape: boolean;
  isTablet: boolean;
  winW: number;
  winH: number;
  insets: ReturnType<typeof useSafeAreaInsets>;
}

export function useModalCardLayout(opts: {
  maxWidth?: number;
  landscapeMaxWidth?: number;
  maxHeightRatio?: number;
} = {}): ModalCardLayout {
  const { width: winW, height: winH } = useWindowDimensions();
  const { isTablet, isLandscape } = useScale();
  const insets = useSafeAreaInsets();

  const maxWidth = opts.maxWidth ?? (isTablet ? 520 : 480);
  const landscapeMaxWidth = opts.landscapeMaxWidth ?? Math.min(winW * 0.85, 600);
  const maxHeightRatio = opts.maxHeightRatio ?? (isLandscape ? 0.88 : 0.85);

  // maxWidth always acts as a hard cap — even in landscape
  const cardWidth = isLandscape ? Math.min(maxWidth, landscapeMaxWidth) : maxWidth;
  const cardMaxHeight = Math.round((winH - insets.top - insets.bottom) * maxHeightRatio);

  return { cardWidth, cardMaxHeight, isLandscape, isTablet, winW, winH, insets };
}
