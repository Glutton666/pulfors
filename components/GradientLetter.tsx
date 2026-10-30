import React from "react";
import { Text, View, type TextStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

interface GradientLetterProps {
  letter: string;
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  /** 글자 대비색 후보. 첫 색을 모든 플랫폼에서 사용한다. */
  colors: [string, string, ...string[]];
  /** 글자의 가독성을 높이는 그림자 색. */
  textShadowColor?: string;
}

/**
 * 굵은 글자(예: 스트롱 비트의 "S")를 모든 플랫폼에서 안정적으로 그린다.
 * S는 폰트·텍스트 마스크·시스템 글자 배율에 의존하지 않는 벡터로 그린다.
 * 작은 비트 셀에서 플랫폼별 글꼴 메트릭이 표시를 결정하지 않도록 한다.
 */
export function GradientLetter({
  letter,
  width,
  height,
  fontSize,
  lineHeight,
  colors,
  textShadowColor,
}: GradientLetterProps) {
  if (letter === "S") {
    const glyphHeight = Math.max(1, Math.min(height, fontSize));
    const glyphWidth = Math.max(1, Math.min(width, glyphHeight * 0.8));
    return (
      <View accessible={false} pointerEvents="none" style={{ width, height, alignItems: "center", justifyContent: "center" }}>
        <Svg
          testID="strong-letter-svg"
          width={glyphWidth}
          height={glyphHeight}
          viewBox="3 2 18 20"
        >
          <Path
            testID="strong-letter-path"
            d="M18 5.5C15.8 3.3 10 3.2 7.3 5.4C4.4 7.8 6.3 10.4 10.1 11.5L13.9 12.6C18.5 13.9 19.7 16.7 16.8 19C14 21.2 8 20.8 5.5 18.3"
            fill="none"
            stroke={colors[0]}
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    );
  }
  const textStyle: TextStyle = {
    fontSize,
    fontWeight: "bold",
    lineHeight,
    textAlign: "center",
  };

  return (
    <View style={{ width, height, alignItems: "center", justifyContent: "center" }}>
      <Text
        testID="gradient-letter-text"
        allowFontScaling={false}
        style={[
          textStyle,
          { color: colors[0] },
          textShadowColor
            ? { textShadowColor, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 }
            : null,
        ]}
      >
        {letter}
      </Text>
    </View>
  );
}
