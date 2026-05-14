import React from "react";
import { Text, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { Colors, LightColors } from "../theme/colors";

interface TimerProps {
  milliseconds: number;
  style?: any; // Allow custom overrides
}

export default function Timer({ milliseconds, style }: TimerProps) {
  const { isDark } = useTheme();
  const C = isDark ? Colors : LightColors;

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Formatting logic: show hours only if they exist
  const formatted =
    hours > 0
      ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      : `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <Text style={[styles.timer, { color: C.text.secondary }, style]}>
      {formatted}
    </Text>
  );
}

const styles = StyleSheet.create({
  timer: {
    fontSize: 24,
    fontWeight: "700", // Slightly bolder for better readability
    fontVariant: ["tabular-nums"], // Keeps numbers from jumping/jittering
  },
});
