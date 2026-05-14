import React, { createContext, useContext, useState, useMemo } from "react";
import { useColorScheme } from "react-native";
import { Colors, LightColors } from "./colors";
import { Spacing } from "./spacing";
import { BorderRadius } from "./spacing"; // Adjust path if needed

// Define what the "Theme" looks like for TypeScript
interface ThemeContextType {
  isDark: boolean;
  theme: typeof Colors;
  spacing: typeof Spacing;
  radius: typeof BorderRadius;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType>({
  isDark: true,
  theme: Colors,
  spacing: Spacing,
  radius: BorderRadius,
  toggleTheme: () => {},
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemScheme = useColorScheme();
  // Initialize based on system settings (Dark/Light)
  const [isDark, setIsDark] = useState(systemScheme === "dark");

  const toggleTheme = () => setIsDark(!isDark);

  // useMemo prevents unnecessary re-renders when the theme hasn't changed
  const value = useMemo(
    () => ({
      isDark,
      theme: isDark ? Colors : LightColors,
      spacing: Spacing,
      radius: BorderRadius,
      toggleTheme,
    }),
    [isDark],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
