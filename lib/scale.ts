import { Dimensions } from "react-native";

const BASE_WIDTH = 375; // iPhone SE reference width
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Scale factor: 1.0 on phones, up to ~1.5 on tablets
export const scale = Math.min(SCREEN_WIDTH / BASE_WIDTH, 1.6);
export const moderateScale = (size: number, factor = 0.5) =>
  size + (scale - 1) * size * factor;
export { SCREEN_WIDTH, SCREEN_HEIGHT };
