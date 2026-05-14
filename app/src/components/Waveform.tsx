import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../theme/ThemeContext";
import { Colors, LightColors } from "../theme/colors";

interface WaveformProps {
  isRecording: boolean;
  isPlaying: boolean;
  metering?: number;
  barCount?: number;
  progress?: number;
}

export default function Waveform({
  isRecording,
  isPlaying,
  metering = -160,
  barCount = 35,
  progress = 0,
}: WaveformProps) {
  const { isDark } = useTheme();
  const C = isDark ? Colors : LightColors;

  // Use a single animation value for the "pulse" to save CPU
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const animations = useRef(
    Array.from({ length: barCount }, () => new Animated.Value(0.1)),
  ).current;

  useEffect(() => {
    if (isPlaying || isRecording) {
      // Loop a single value for sine-wave calculations
      Animated.loop(
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    } else {
      pulseAnim.setValue(0);
      animations.forEach((anim) => {
        Animated.spring(anim, {
          toValue: 0.1,
          tension: 100,
          friction: 10,
          useNativeDriver: false, // height cannot use native driver
        }).start();
      });
    }
  }, [isPlaying, isRecording]);

  useEffect(() => {
    if (isRecording) {
      // Logic for real-time metering (input from microphone)
      const normalized = Math.max(0.1, Math.min(1, (metering + 160) / 160));
      animations.forEach((anim, i) => {
        const variation = Math.random() * 0.2; // Add some jitter for realism
        Animated.timing(anim, {
          toValue: normalized + variation,
          duration: 100,
          useNativeDriver: false,
        }).start();
      });
    }
  }, [metering, isRecording]);

  return (
    <View style={styles.container}>
      {animations.map((anim, index) => {
        // Calculate progress: bars turn gold once "played"
        const isPast = isPlaying && index / barCount <= progress;

        return (
          <Animated.View
            key={index}
            style={[
              styles.bar,
              {
                height: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [6, 72],
                }),
                backgroundColor: isPast
                  ? "#FFD700"
                  : isDark
                    ? "rgba(255,255,255,0.2)"
                    : "rgba(0,0,0,0.1)",
                opacity: isRecording ? 1 : isPast ? 1 : 0.6,
              },
            ]}
          >
            {(isRecording || isPast) && (
              <LinearGradient
                colors={
                  isPast ? ["#FFD700", "#FF6B35"] : ["#FF6B35", "#FFB347"]
                }
                style={StyleSheet.absoluteFill}
              />
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 80,
    gap: 3, // Slightly wider gap for a cleaner look
  },
  bar: {
    width: 4, // Slightly thinner bars look more modern
    borderRadius: 2,
    overflow: "hidden",
  },
});
