import { TextStyle } from "react-native";

// 1. Define the Font Families (Ensure these match your Expo font loading)
const Families = {
  regular: "Inter",
  bold: "Inter-Bold",
  black: "Inter-Black",
};

// 2. Define the Type Scale
export const Typography: Record<string, TextStyle> = {
  h1: {
    fontFamily: Families.black,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  h2: {
    fontFamily: Families.bold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  h3: {
    fontFamily: Families.bold,
    fontSize: 20,
    lineHeight: 28,
  },
  body: {
    fontFamily: Families.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  bodyBold: {
    fontFamily: Families.bold,
    fontSize: 16,
    lineHeight: 24,
  },
  caption: {
    fontFamily: Families.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  tiny: {
    fontFamily: Families.regular,
    fontSize: 12,
    lineHeight: 16,
  },
};
