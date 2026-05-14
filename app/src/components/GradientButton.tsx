import React from "react";
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BorderRadius } from "../theme/spacing";
import { useTheme } from "../theme/ThemeContext";
import { Colors, LightColors } from "../theme/colors";

interface GradientButtonProps {
  onPress: () => void;
  label: string;
  style?: ViewStyle;
  variant?: "primary" | "secondary" | "following"; // Added following variant
}

export default function GradientButton({
  onPress,
  label,
  style,
  variant = "primary",
}: GradientButtonProps) {
  const { isDark } = useTheme();
  const C = isDark ? Colors : LightColors;

  // FOLLOWING STATE (Twitter-style: Subtle, matches theme)
  if (variant === "following") {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={[
          styles.base, 
          styles.following, 
          { backgroundColor: C.surface, borderColor: C.border }, 
          style
        ]}
        activeOpacity={0.7}
      >
        <Text style={[styles.followingText, { color: C.text.primary }]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  // SECONDARY STATE
  if (variant === "secondary") {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={[
          styles.base, 
          styles.secondary, 
          { backgroundColor: 'transparent', borderColor: C.border }, 
          style
        ]}
        activeOpacity={0.8}
      >
        <Text style={[styles.secondaryText, { color: C.text.secondary }]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  // PRIMARY STATE (Your Signature Gradient)
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={style}>
      <LinearGradient
        colors={["#FF6B35", "#FFB347", "#FFD700"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }} // Changed to horizontal for a sleeker look
        style={[styles.base, styles.glow]}
      >
        <Text style={styles.text}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 10, // Slimmer for profile actions
    paddingHorizontal: 24,
    borderRadius: 25, // More rounded like Twitter
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  glow: {
    shadowColor: "#FF6B35",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  secondary: {
    borderWidth: 1,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: "600",
  },
  following: {
    borderWidth: 1,
  },
  followingText: {
    fontSize: 15,
    fontWeight: "600",
  },
});