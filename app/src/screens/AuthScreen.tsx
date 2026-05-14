import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../theme/ThemeContext";
import { Colors, LightColors } from "../theme/colors";
import { BorderRadius, Spacing } from "../theme/spacing";
import { signUp, login } from "../services/firebase";

export default function AuthScreen() {
  const { isDark } = useTheme();
  const C = isDark ? Colors : LightColors;

  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password || (isSignUp && !username.trim())) {
      Alert.alert("Missing Info", "Please fill in all fields to continue.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Security", "Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        // Remove @ and spaces from username for consistency
        const cleanUsername = username
          .trim()
          .replace("@", "")
          .replace(/\s/g, "");
        await signUp(email.trim(), password, cleanUsername);
      } else {
        await login(email.trim(), password);
      }
    } catch (error: any) {
      let message = "An unexpected error occurred.";
      if (error.code === "auth/email-already-in-use")
        message = "This email is already registered.";
      else if (error.code === "auth/invalid-email")
        message = "Please enter a valid email.";
      else if (error.code === "auth/invalid-credential")
        message = "Incorrect email or password.";

      Alert.alert("Auth Error", message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.inner}
      >
        <Image source={require("../../assets/logo.png")} style={styles.logo} />
        <Text style={[styles.title, { color: C.text.primary }]}>Yapin</Text>
        <Text style={[styles.subtitle, { color: C.text.muted }]}>
          Your voice, your vibe
        </Text>

        {/* Auth Toggle (Twitter-style pill) */}
        <View
          style={[
            styles.toggle,
            { backgroundColor: C.surface, borderColor: C.border },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.toggleButton,
              isSignUp && { backgroundColor: C.card },
            ]}
            onPress={() => setIsSignUp(true)}
          >
            <Text
              style={[
                styles.toggleText,
                { color: isSignUp ? C.text.primary : C.text.muted },
              ]}
            >
              Sign Up
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              !isSignUp && { backgroundColor: C.card },
            ]}
            onPress={() => setIsSignUp(false)}
          >
            <Text
              style={[
                styles.toggleText,
                { color: !isSignUp ? C.text.primary : C.text.muted },
              ]}
            >
              Log In
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          {isSignUp && (
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: C.surface,
                  color: C.text.primary,
                  borderColor: C.border,
                },
              ]}
              placeholder="Username"
              placeholderTextColor={C.text.muted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: C.surface,
                color: C.text.primary,
                borderColor: C.border,
              },
            ]}
            placeholder="Email"
            placeholderTextColor={C.text.muted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: C.surface,
                color: C.text.primary,
                borderColor: C.border,
              },
            ]}
            placeholder="Password"
            placeholderTextColor={C.text.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
            style={styles.buttonContainer}
          >
            <LinearGradient
              colors={["#FF6B35", "#FFB347"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.button}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>
                  {isSignUp ? "Create Account" : "Welcome Back"}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  logo: { width: 80, height: 80, borderRadius: 18, marginBottom: Spacing.sm },
  title: { fontSize: 28, fontWeight: "900", marginBottom: 4 },
  subtitle: { fontSize: 16, marginBottom: Spacing.xl },
  toggle: {
    flexDirection: "row",
    borderRadius: 25,
    padding: 4,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    width: "100%",
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 22,
    alignItems: "center",
  },
  toggleText: { fontWeight: "700", fontSize: 15 },
  form: { width: "100%" },
  input: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: 16,
    fontSize: 16,
    marginBottom: Spacing.md,
  },
  buttonContainer: {
    marginTop: Spacing.md,
    width: "100%",
    borderRadius: 30,
    overflow: "hidden",
  },
  button: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF6B35",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});
