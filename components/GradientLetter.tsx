import React from "react";
import { Platform, Text, View, type TextStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";

interface GradientLetterProps {
  letter: string;
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  /** 위→아래 그라디언트 색상. 최소 2개. */
  colors: [string, string, ...string[]];
  /** 웹 폴백(단색 텍스트)에만 적용되는 그림자 색. */
  textShadowColor?: string;
}

/**
 * 굵은 글자(예: 스트롱 비트의 "S")를 세로 그라디언트로 채워서 그린다.
 *
 * MaskedView(텍스트 모양으로 그라디언트를 마스킹)를 쓰는데, 웹에서는
 * react-native-masked-view의 지원이 불안정하고 이 앱은 웹도 지원하므로
 * 웹에서는 그라디언트의 첫 색으로 단색 텍스트를 그리는 폴백을 쓴다.
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

  if (Platform.OS === "web") {
    return (
      <View style={{ width, height, alignItems: "center", justifyContent: "center" }}>
        <Text
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

  return (
    <MaskedView
      style={{ width, height }}
      maskElement={
        <View style={{ width, height, alignItems: "center", justifyContent: "center" }}>
          <Text style={[textStyle, { color: "#000" }]}>{letter}</Text>
        </View>
      }
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ width, height }}
      />
    </MaskedView>
  );
}
