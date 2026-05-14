import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { Colors, LightColors } from "../theme/colors";
import { Spacing, BorderRadius } from "../theme/spacing";
import { uploadYap, getCurrentUsername, auth } from "../services/firebase";
import Waveform from "../components/Waveform";
import Timer from "../components/Timer";

export default function RecordScreen({ navigation }: any) {
  const { isDark } = useTheme();
  const C = isDark ? Colors : LightColors;

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [metering, setMetering] = useState(-160);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  const sound = useRef<Audio.Sound | null>(null);
  const meteringInterval = useRef<NodeJS.Timeout | null>(null);
  const playbackInterval = useRef<NodeJS.Timeout | null>(null);

  // 1. Lifecycle Cleanup
  useEffect(() => {
    return () => {
      cleanupAudio();
      if (recording) stopRecording();
    };
  }, []);

  const cleanupAudio = async () => {
    if (sound.current) {
      await sound.current.unloadAsync();
      sound.current = null;
    }
    if (playbackInterval.current) clearInterval(playbackInterval.current);
    setIsPlaying(false);
    setPosition(0);
  };

  // 2. Recording Logic
  async function startRecording() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted")
        return Alert.alert("Permission denied", "We need mic access to Yap!");

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });

      setRecording(newRecording);
      setAudioUri(null);

      meteringInterval.current = setInterval(async () => {
        const status = await newRecording.getStatusAsync();
        if (status.metering !== undefined) {
          setMetering(status.metering);
          setDuration(status.durationMillis || 0);
        }
      }, 100);
    } catch (err) {
      console.error("Failed to start recording", err);
    }
  }

  async function stopRecording() {
    if (!recording) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (meteringInterval.current) clearInterval(meteringInterval.current);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setAudioUri(uri);
    setRecording(null);

    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  }

  // 3. Playback Logic
  async function togglePlayback() {
    if (isPlaying && sound.current) {
      await sound.current.pauseAsync();
      setIsPlaying(false);
      if (playbackInterval.current) clearInterval(playbackInterval.current);
    } else {
      if (!sound.current && audioUri) {
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: audioUri },
          { shouldPlay: true },
          (status: any) => {
            if (status.didJustFinish) cleanupAudio();
          },
        );
        sound.current = newSound;
      } else {
        await sound.current?.playAsync();
      }

      setIsPlaying(true);
      playbackInterval.current = setInterval(async () => {
        const status = await sound.current?.getStatusAsync();
        if (status?.isLoaded) setPosition(status.positionMillis);
      }, 100);
    }
  }

  const handlePost = async () => {
    if (!audioUri || !auth.currentUser) return;
    setUploading(true);
    try {
      const username = await getCurrentUsername(auth.currentUser.uid);
      const hashtags =
        caption.match(/#(\w+)/g)?.map((t) => t.toLowerCase()) || [];

      await uploadYap(
        auth.currentUser.uid,
        username,
        audioUri,
        caption,
        hashtags,
        [],
        duration,
      );

      navigation.navigate("Feed");
    } catch (error) {
      Alert.alert("Upload Failed", "Try again in a moment.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <LinearGradient
        colors={[C.background, C.surface]}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="close" size={28} color={C.text.primary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: C.text.primary }]}>
              Post a Yap
            </Text>
            <View style={{ width: 28 }} />
          </View>

          <View
            style={[
              styles.waveBox,
              { backgroundColor: isDark ? "#1A1C2A" : "#F0F0F5" },
            ]}
          >
            <Waveform
              isRecording={!!recording}
              metering={metering}
              progress={duration > 0 ? position / duration : 0}
            />
            <Timer
              milliseconds={isPlaying ? position : duration}
              style={styles.timerText}
            />
          </View>

          <View style={styles.actionCenter}>
            {!audioUri ? (
              <TouchableOpacity
                onPressIn={startRecording}
                onPressOut={stopRecording}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={
                    recording ? ["#FF4B4B", "#FF0000"] : ["#FF6B35", "#FFB347"]
                  }
                  style={styles.micButton}
                >
                  <Ionicons
                    name={recording ? "stop" : "mic"}
                    size={40}
                    color="#FFF"
                  />
                </LinearGradient>
                <Text style={[styles.hint, { color: C.text.muted }]}>
                  {recording ? "Release to stop" : "Hold to record"}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.reviewContainer}>
                <TouchableOpacity
                  onPress={togglePlayback}
                  style={[styles.roundBtn, { backgroundColor: C.accent }]}
                >
                  <Ionicons
                    name={isPlaying ? "pause" : "play"}
                    size={24}
                    color="#FFF"
                  />
                </TouchableOpacity>

                <TextInput
                  style={[
                    styles.input,
                    { color: C.text.primary, borderColor: C.border },
                  ]}
                  placeholder="What's on your mind? #hashtags"
                  placeholderTextColor={C.text.muted}
                  multiline
                  value={caption}
                  onChangeText={setCaption}
                />

                <View style={styles.footer}>
                  <TouchableOpacity
                    onPress={() => setAudioUri(null)}
                    style={styles.retryBtn}
                  >
                    <Text style={{ color: C.text.muted }}>Delete & Retry</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handlePost}
                    disabled={uploading}
                    style={[styles.postBtn, { backgroundColor: C.accent }]}
                  >
                    <Text style={styles.postBtnText}>
                      {uploading ? "Posting..." : "Yap it!"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 60 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 40,
  },
  title: { fontSize: 20, fontWeight: "800" },
  waveBox: {
    height: 180,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 30,
  },
  timerText: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: 10,
    color: "#FF6B35",
  },
  actionCenter: { alignItems: "center" },
  micButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    elevation: 10,
    shadowColor: "#FF6B35",
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
  hint: { marginTop: 15, fontWeight: "600" },
  reviewContainer: { width: "100%", alignItems: "center" },
  roundBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  input: {
    width: "100%",
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 15,
    padding: 15,
    fontSize: 16,
    textAlignVertical: "top",
  },
  footer: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
  },
  retryBtn: { padding: 10 },
  postBtn: { paddingHorizontal: 30, paddingVertical: 12, borderRadius: 25 },
  postBtnText: { color: "#FFF", fontWeight: "800", fontSize: 16 },
});
