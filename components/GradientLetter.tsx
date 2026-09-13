import React from "react";
import { Text, View, type TextStyle } from "react-native";

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
 * 네이티브 MaskedView 텍스트는 release 빌드에서 빈 마스크가 되거나 작은
 * 셀 안에서 잘릴 수 있으므로, 배경 그라디언트 위에 대비색 Text를 사용한다.
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
