import { Dimensions } from "react-native";

const BASE_WIDTH = 375;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const IS_TABLET = Math.min(SCREEN_WIDTH, SCREEN_HEIGHT) >= 600;

const scale = IS_TABLET
  ? Math.min(SCREEN_WIDTH / BASE_WIDTH, 2.2)
  : Math.min(SCREEN_WIDTH / BASE_WIDTH, 1.6);

const moderateScale = (size: number, factor = 0.5) =>
  size + (scale - 1) * size * factor;

const CONTENT_MAX_WIDTH = IS_TABLET ? 560 : undefined;

export { scale, moderateScale, SCREEN_WIDTH, SCREEN_HEIGHT, IS_TABLET, CONTENT_MAX_WIDTH };
