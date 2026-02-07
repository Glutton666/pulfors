import React, { useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Dimensions,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface SwipeSelectorProps {
  items: { label: string; value: string | number }[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  itemWidth?: number;
  labelStyle?: "large" | "small";
}

export function SwipeSelector({
  items,
  selectedIndex,
  onSelect,
  itemWidth = 100,
  labelStyle = "small",
}: SwipeSelectorProps) {
  const listRef = useRef<FlatList>(null);
  const sideSpacing = (SCREEN_WIDTH - itemWidth) / 2;
  const didMount = useRef(false);

  useEffect(() => {
    if (listRef.current && selectedIndex >= 0 && selectedIndex < items.length) {
      setTimeout(() => {
        listRef.current?.scrollToOffset({
          offset: selectedIndex * itemWidth,
          animated: didMount.current,
        });
        didMount.current = true;
      }, 50);
    }
  }, [selectedIndex, itemWidth, items.length]);

  const handleMomentumEnd = (event: any) => {
    const offset = event.nativeEvent.contentOffset.x;
    const idx = Math.round(offset / itemWidth);
    const clampedIdx = Math.max(0, Math.min(idx, items.length - 1));
    if (clampedIdx !== selectedIndex) {
      if (Platform.OS !== "web") Haptics.selectionAsync();
      onSelect(clampedIdx);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.indicator, { width: itemWidth - 16 }]} />
      <FlatList
        ref={listRef}
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={itemWidth}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: sideSpacing }}
        onMomentumScrollEnd={handleMomentumEnd}
        scrollEnabled={items.length > 0}
        keyExtractor={(item, idx) => `${item.value}-${idx}`}
        renderItem={({ item, index }) => {
          const isSelected = index === selectedIndex;
          return (
            <Pressable
              onPress={() => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                onSelect(index);
              }}
              style={[styles.item, { width: itemWidth }]}
            >
              <Text
                style={[
                  labelStyle === "large" ? styles.labelLarge : styles.label,
                  isSelected && styles.labelSelected,
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  indicator: {
    position: "absolute",
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.accentDim,
    borderWidth: 1,
    borderColor: Colors.accent,
    zIndex: 0,
  },
  item: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: "SpaceGrotesk_500Medium",
    fontSize: 14,
    color: Colors.textTertiary,
  },
  labelLarge: {
    fontFamily: "SpaceGrotesk_600SemiBold",
    fontSize: 18,
    color: Colors.textTertiary,
  },
  labelSelected: {
    color: Colors.accent,
  },
});
