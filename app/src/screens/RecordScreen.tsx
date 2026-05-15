import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { Colors, LightColors } from "../theme/colors";
import { Spacing, BorderRadius } from "../theme/spacing";
import { uploadYap, getCurrentUsername, auth } from "../services/firebase";
import Waveform from "../components/Waveform";

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
  const [yapping, setYapping] = useState(false);

  const sound = useRef<Audio.Sound | null>(null);
  const meteringInterval = useRef<NodeJS.Timeout | null>(null);
  const playbackInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      cleanupAudio();
      if (recording) stopRecording();
    };
  }, []);

  const cleanupAudio = async () => {
    if (sound.current) { await sound.current.unloadAsync(); sound.current = null; }
    if (playbackInterval.current) clearInterval(playbackInterval.current);
    setIsPlaying(false);
    setPosition(0);
  };

  async function startRecording() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return Alert.alert("Permission denied", "We need mic access to Yap!");

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const { recording: newRecording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });

      setRecording(newRecording);
      setAudioUri(null);
      setYapping(true);

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
    setYapping(false);

    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  }

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
          (status: any) => { if (status.didJustFinish) cleanupAudio(); }
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

  const handleYap = async () => {
    if (!audioUri || !auth.currentUser) return;
    setYapping(true);
    try {
      const username = await getCurrentUsername(auth.currentUser.uid);
      const hashtags = caption.match(/#(\w+)/g)?.map(t => t.toLowerCase()) || [];
      const mentions = caption.match(/@(\w+)/g)?.map(m => m.substring(1)) || [];

      await uploadYap(auth.currentUser.uid, username, audioUri, caption, hashtags, mentions, duration);

      navigation.navigate("Feed");
    } catch (error) {
      Alert.alert("Upload Failed", "Try yapping again.");
    } finally {
      setYapping(false);
    }
  };

  const formatTime = (ms: number) => {
    const ts = Math.floor(ms / 1000);
    return Math.floor(ts / 60) + ":" + (ts % 60).toString().padStart(2, '0');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <LinearGradient colors={[C.background, C.surface]} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={28} color={C.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: C.text.primary }]}>
            {audioUri ? "Review Yap" : recording ? "Yapping..." : "Hold to Yap"}
          </Text>
          <View style={{ width: 28 }} />
        </View>

        {/* Waveform Area */}
        <View style={[styles.waveBox, { backgroundColor: isDark ? '#1A1C2A' : '#F0F0F5' }]}>
          <Waveform
            isRecording={!!recording}
            isPlaying={isPlaying}
            metering={metering}
            progress={duration > 0 ? position / duration : 0}
          />
          <Text style={[styles.timerText, { color: C.accent }]}>
            {formatTime(isPlaying ? position : duration)}
          </Text>
        </View>

        {/* Recording Area - No text input yet */}
        {!audioUri && (
          <View style={styles.actionCenter}>
            <TouchableOpacity
              onPress={() => { if (recording) { stopRecording(); } else { startRecording(); } }}
              
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={recording ? ['#E0245E', '#FF4D6A'] : ['#FF6B35', '#FFB347']}
                style={styles.micButton}
              >
                <Ionicons name={recording ? "radio" : "mic"} size={48} color="#FFF" />
              </LinearGradient>
            </TouchableOpacity>
            <Text style={[styles.hint, { color: C.text.muted }]}>
              {recording ? "Release to stop yapping" : "Hold to start yapping"}
            </Text>
          </View>
        )}

        {/* After Recording - Caption + Yap Button */}
        {audioUri && (
          <View style={styles.reviewContainer}>
            <TouchableOpacity onPress={togglePlayback} style={[styles.playBtn, { backgroundColor: C.accent }]}>
              <Ionicons name={isPlaying ? "pause" : "play"} size={28} color="#FFF" />
              <Text style={{ color: '#FFF', fontWeight: '700', marginLeft: 8 }}>
                {isPlaying ? "Pause" : "Preview"}
              </Text>
            </TouchableOpacity>

            <TextInput
              style={[styles.captionInput, { color: C.text.primary, borderColor: C.border, backgroundColor: C.surface }]}
              placeholder="Add caption... #hashtags @mentions"
              placeholderTextColor={C.text.muted}
              multiline
              maxLength={280}
              value={caption}
              onChangeText={setCaption}
            />

            <View style={styles.footer}>
              <TouchableOpacity onPress={() => { setAudioUri(null); setCaption(''); }} style={styles.retryBtn}>
                <Ionicons name="refresh" size={18} color={C.text.muted} />
                <Text style={{ color: C.text.muted, marginLeft: 6 }}>Re-yap</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleYap}
                disabled={yapping}
                style={[styles.yapBtn, { backgroundColor: C.accent }]}
              >
                {yapping ? (
                  <Text style={styles.yapBtnText}>Yapping...</Text>
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#FFF" />
                    <Text style={styles.yapBtnText}>Yap</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  title: { fontSize: 20, fontWeight: '800' },
  waveBox: { height: 200, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 30 },
  timerText: { fontSize: 28, fontWeight: '700', marginTop: 15 },
  actionCenter: { alignItems: 'center' },
  micButton: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', elevation: 10, shadowColor: '#FF6B35', shadowOpacity: 0.3, shadowRadius: 20 },
  hint: { marginTop: 20, fontWeight: '600', fontSize: 16, textAlign: 'center' },
  reviewContainer: { width: '100%', alignItems: 'center' },
  playBtn: { flexDirection: 'row', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 25, alignItems: 'center', marginBottom: 20 },
  captionInput: { width: '100%', minHeight: 100, borderWidth: 1, borderRadius: 15, padding: 15, fontSize: 16, textAlignVertical: 'top', marginBottom: 20 },
  footer: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', alignItems: 'center' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  yapBtn: { flexDirection: 'row', paddingHorizontal: 30, paddingVertical: 14, borderRadius: 25, alignItems: 'center', gap: 8 },
  yapBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
});
