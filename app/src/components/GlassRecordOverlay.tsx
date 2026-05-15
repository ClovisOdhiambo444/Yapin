import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, Animated, Modal, Dimensions,
  ScrollView, FlatList, Image, ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Colors } from "../theme/colors";
import { uploadYap, getCurrentUsername, auth, db } from "../services/firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";

const { width, height } = Dimensions.get('window');

function PulsingWave({ isActive, metering }: { isActive: boolean; metering: number }) {
  const bars = 40;
  const animations = useRef(Array.from({ length: bars }, () => new Animated.Value(0.1))).current;
  useEffect(() => {
    if (isActive) {
      const interval = setInterval(() => {
        const normalized = Math.max(0.1, (metering + 160) / 160);
        animations.forEach((anim, i) => {
          const variation = Math.sin(i * 0.5 + Date.now() * 0.01) * 0.3;
          const height = Math.max(0.05, normalized + variation);
          Animated.spring(anim, { toValue: height, tension: 60, friction: 8, useNativeDriver: false }).start();
        });
      }, 80);
      return () => clearInterval(interval);
    } else {
      animations.forEach(anim => Animated.spring(anim, { toValue: 0.1, tension: 80, friction: 10, useNativeDriver: false }).start());
    }
  }, [isActive, metering]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, height: 100 }}>
      {animations.map((anim, i) => (
        <Animated.View key={i} style={{ width: 4, borderRadius: 2, height: anim.interpolate({ inputRange: [0, 1], outputRange: [4, 100] }), backgroundColor: '#FF6B35', opacity: anim.interpolate({ inputRange: [0.05, 1], outputRange: [0.2, 1] }) }} />
      ))}
    </View>
  );
}

interface Props { visible: boolean; onClose: () => void; }

export default function GlassRecordOverlay({ visible, onClose }: Props) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [metering, setMetering] = useState(-160);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [caption, setCaption] = useState("");
  const [yapping, setYapping] = useState(false);
  const [showCaption, setShowCaption] = useState(false);
  const sound = useRef<Audio.Sound | null>(null);
  const meteringInterval = useRef<NodeJS.Timeout | null>(null);
  const playbackInterval = useRef<NodeJS.Timeout | null>(null);

  // Autocomplete state
  const [mentionSuggestions, setMentionSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");

  useEffect(() => { return () => { cleanupAudio(); if (recording) stopSilent(); }; }, []);
  const cleanupAudio = async () => { if (sound.current) { await sound.current.unloadAsync(); sound.current = null; } if (playbackInterval.current) clearInterval(playbackInterval.current); setIsPlaying(false); setPosition(0); };
  const stopSilent = async () => { if (!recording) return; if (meteringInterval.current) clearInterval(meteringInterval.current); await recording.stopAndUnloadAsync(); setRecording(null); };

  async function startRecording() {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') return Alert.alert("Permission", "Mic access needed!");
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording: rec } = await Audio.Recording.createAsync({ ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true });
    setRecording(rec); setAudioUri(null); setShowCaption(false);
    meteringInterval.current = setInterval(async () => { const st = await rec.getStatusAsync(); if (st.metering !== undefined) { setMetering(st.metering); setDuration(st.durationMillis || 0); } }, 80);
  }

  async function stopRecording() {
    if (!recording) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (meteringInterval.current) clearInterval(meteringInterval.current);
    await recording.stopAndUnloadAsync();
    setAudioUri(recording.getURI()); setRecording(null); setShowCaption(true);
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  }

  async function togglePlayback() {
    if (isPlaying && sound.current) { await sound.current.pauseAsync(); setIsPlaying(false); if (playbackInterval.current) clearInterval(playbackInterval.current); }
    else {
      if (!sound.current && audioUri) { const { sound: ns } = await Audio.Sound.createAsync({ uri: audioUri }, { shouldPlay: true }, (st: any) => { if (st.didJustFinish) cleanupAudio(); }); sound.current = ns; }
      else { await sound.current?.playAsync(); }
      setIsPlaying(true);
      playbackInterval.current = setInterval(async () => { const st = await sound.current?.getStatusAsync(); if (st?.isLoaded) setPosition(st.positionMillis); }, 100);
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
      setAudioUri(null); setCaption(''); setShowCaption(false); setYapping(false);
      onClose();
    } catch (error) { Alert.alert("Failed", "Try again."); setYapping(false); }
  };

  const formatTime = (ms: number) => { const ts = Math.floor(ms / 1000); return Math.floor(ts / 60) + ":" + (ts % 60).toString().padStart(2, '0'); };

  // Autocomplete logic: detect @mention in caption
  const handleCaptionChange = async (text: string) => {
    setCaption(text);
    const atIndex = text.lastIndexOf('@');
    if (atIndex !== -1) {
      const queryText = text.substring(atIndex + 1).toLowerCase();
      if (queryText.length > 0 && !queryText.includes(' ')) {
        setMentionSearch(queryText);
        // fetch suggestions
        const q = query(collection(db, "users"), where("username", ">=", queryText), where("username", "<=", queryText + "\uf8ff"), limit(5));
        const snap = await getDocs(q);
        const suggestions = snap.docs.map(d => ({ id: d.id, username: d.data().username }));
        setMentionSuggestions(suggestions);
        setShowSuggestions(suggestions.length > 0);
        return;
      }
    }
    setShowSuggestions(false);
  };

  const selectMention = (username: string) => {
    const atIndex = caption.lastIndexOf('@');
    if (atIndex !== -1) {
      const newCaption = caption.substring(0, atIndex) + '@' + username + ' ';
      setCaption(newCaption);
      setShowSuggestions(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <BlurView intensity={80} tint="dark" style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, width: '100%' }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60 }} keyboardShouldPersistTaps="handled">
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' }}>
              <TouchableOpacity style={{ position: 'absolute', top: 0, right: 0, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }} onPress={() => { cleanupAudio(); if (recording) stopSilent(); setAudioUri(null); setShowCaption(false); onClose(); }}>
                <Ionicons name="close" size={28} color="#FFF" />
              </TouchableOpacity>

              <PulsingWave isActive={!!recording || isPlaying} metering={metering} />
              <Text style={{ fontSize: 40, fontWeight: '700', color: '#FF6B35', marginTop: 24 }}>{formatTime(isPlaying ? position : duration)}</Text>

              {!audioUri && (
                <View style={{ alignItems: 'center', paddingBottom: 40 }}>
                  <TouchableOpacity onPress={recording ? stopRecording : startRecording} activeOpacity={0.8}>
                    <LinearGradient colors={recording ? ['#E0245E', '#FF4D6A'] : ['#FF6B35', '#FFB347', '#FFD700']} style={{ width: 90, height: 90, borderRadius: 45, justifyContent: 'center', alignItems: 'center', shadowColor: '#FF6B35', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 40, elevation: 20 }}>
                      <Ionicons name={recording ? "stop" : "mic"} size={48} color="#FFF" />
                    </LinearGradient>
                  </TouchableOpacity>
                  <Text style={{ marginTop: 20, fontWeight: '600', fontSize: 16, color: 'rgba(255,255,255,0.7)' }}>{recording ? "Tap to stop" : "Tap to yap"}</Text>
                </View>
              )}

              {audioUri && showCaption && (
                <View style={{ width: '100%', paddingBottom: 20, marginTop: 20 }}>
                  <TouchableOpacity onPress={togglePlayback} style={{ flexDirection: 'row', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF6B35', marginBottom: 16 }}>
                    <Ionicons name={isPlaying ? "pause" : "play"} size={22} color="#FFF" />
                    <Text style={{ color: '#FFF', fontWeight: '700', marginLeft: 8 }}>{isPlaying ? "Pause" : "Preview"}</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={{ width: '100%', minHeight: 70, borderRadius: 15, padding: 15, fontSize: 16, textAlignVertical: 'top', color: '#FFF', backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 8 }}
                    placeholder="Add caption... #hashtags @mentions"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    multiline
                    maxLength={280}
                    value={caption}
                    onChangeText={handleCaptionChange}
                  />
                  {showSuggestions && (
                    <View style={{ backgroundColor: 'rgba(30,30,40,0.95)', borderRadius: 12, marginBottom: 12, padding: 8 }}>
                      {mentionSuggestions.map((user) => (
                        <TouchableOpacity key={user.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12 }} onPress={() => selectMention(user.username)}>
                          <Text style={{ color: '#FFF', fontWeight: '600' }}>@{user.username}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <TouchableOpacity onPress={() => { setAudioUri(null); setCaption(''); setShowCaption(false); }} style={{ flexDirection: 'row', alignItems: 'center', padding: 10 }}>
                      <Ionicons name="refresh" size={18} color="#FFF" /><Text style={{ color: '#FFF', marginLeft: 6 }}>Re-yap</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleYap} disabled={yapping} style={{ flexDirection: 'row', paddingHorizontal: 30, paddingVertical: 14, borderRadius: 25, alignItems: 'center', gap: 8, backgroundColor: '#FF6B35' }}>
                      {yapping ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="send" size={18} color="#FFF" /><Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>Yap</Text></>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </BlurView>
    </Modal>
  );
}
