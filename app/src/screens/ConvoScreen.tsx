import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { Colors, LightColors } from "../theme/colors";
import { BorderRadius, Spacing } from "../theme/spacing";
import {
  auth,
  listenToConvo,
  addComment,
  getCurrentUsername,
  likeComment,
  unlikeComment,
  isCommentLiked,
  echoComment,
} from "../services/firebase";
import YapCard from "../components/YapCard";

export default function ConvoScreen({ route, navigation }: any) {
  const { yapId, yap } = route.params;
  const { isDark } = useTheme();
  const C = isDark ? Colors : LightColors;

  const [comments, setComments] = useState<any[]>([]);
  const [textInput, setTextInput] = useState("");
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [playbackPos, setPlaybackPos] = useState(0);
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);

  const posInterval = useRef<NodeJS.Timeout | null>(null);

  // 1. Listen to Real-time Comments
  useEffect(() => {
    const unsub = listenToConvo(yapId, (newComments) => {
      setComments(newComments);
      // Batch check likes whenever comments update
      syncLikedStatus(newComments);
    });
    return () => {
      unsub();
      if (sound) sound.unloadAsync();
      if (posInterval.current) clearInterval(posInterval.current);
    };
  }, [yapId]);

  // 2. Batch sync liked status to avoid multiple re-renders
  async function syncLikedStatus(commentList: any[]) {
    const u = auth.currentUser;
    if (!u) return;

    const likedSet = new Set<string>();
    await Promise.all(
      commentList.map(async (c) => {
        const liked = await isCommentLiked(yapId, c.id, u.uid);
        if (liked) likedSet.add(c.id);
      }),
    );
    setLikedComments(likedSet);
  }

  // 3. Audio Playback Position Tracker
  useEffect(() => {
    if (sound && playingId) {
      posInterval.current = setInterval(async () => {
        const status = await sound.getStatusAsync();
        if (status.isLoaded && status.durationMillis) {
          setPlaybackPos(status.positionMillis / status.durationMillis);
        }
      }, 100);
    } else {
      if (posInterval.current) clearInterval(posInterval.current);
      setPlaybackPos(0);
    }
  }, [sound, playingId]);

  async function handleSendText() {
    if (!textInput.trim() || isSending) return;
    const u = auth.currentUser;
    if (!u) return;

    setIsSending(true);
    try {
      const username = await getCurrentUsername(u.uid);
      await addComment(yapId, u.uid, username, "text", textInput.trim());
      setTextInput("");
    } finally {
      setIsSending(false);
    }
  }

  // Memoized waveform bars for better performance
  const bars = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => 0.2 + Math.sin(i * 1.2) * 0.3 + 0.3),
    [],
  );

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      {/* Custom Header */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={28} color={C.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.text.primary }]}>
          Thread
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View style={styles.originalYapContainer}>
              <YapCard {...yap} yapId={yapId} />
              <View style={[styles.separator, { backgroundColor: C.border }]} />
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.commentItem}>
              <View style={styles.avatarContainer}>
                {item.avatarUrl ? (
                  <Image
                    source={{ uri: item.avatarUrl }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Text style={styles.avatarInitial}>
                      {item.username?.[0]?.toUpperCase()}
                    </Text>
                  </View>
                )}
                <View
                  style={[styles.threadLine, { backgroundColor: C.border }]}
                />
              </View>

              <View style={styles.commentContent}>
                <Text style={[styles.username, { color: C.text.primary }]}>
                  @{item.username}
                </Text>

                {item.type === "text" ? (
                  <Text
                    style={[styles.commentText, { color: C.text.secondary }]}
                  >
                    {item.content}
                  </Text>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.voiceBubble,
                      {
                        backgroundColor: isDark
                          ? "rgba(255,107,53,0.1)"
                          : "rgba(255,107,53,0.05)",
                      },
                    ]}
                    onPress={() => playComment(item.id, item.content)}
                  >
                    <Ionicons
                      name={playingId === item.id ? "pause" : "play"}
                      size={16}
                      color="#FF6B35"
                    />
                    <View style={styles.waveformContainer}>
                      {bars.map((h, i) => (
                        <View
                          key={i}
                          style={[
                            styles.waveBar,
                            {
                              height: h * 18,
                              backgroundColor:
                                playingId === item.id && i / 20 <= playbackPos
                                  ? "#FF6B35"
                                  : isDark
                                    ? "rgba(255,255,255,0.2)"
                                    : "rgba(0,0,0,0.1)",
                            },
                          ]}
                        />
                      ))}
                    </View>
                  </TouchableOpacity>
                )}

                <View style={styles.commentActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleLikeComment(item.id)}
                  >
                    <Ionicons
                      name={
                        likedComments.has(item.id) ? "heart" : "heart-outline"
                      }
                      size={16}
                      color={
                        likedComments.has(item.id) ? "#E0245E" : C.text.muted
                      }
                    />
                    <Text
                      style={[
                        styles.actionText,
                        {
                          color: likedComments.has(item.id)
                            ? "#E0245E"
                            : C.text.muted,
                        },
                      ]}
                    >
                      {item.likeCount || ""}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          contentContainerStyle={styles.listContent}
        />

        {/* Input Bar */}
        <View
          style={[
            styles.inputContainer,
            { backgroundColor: C.surface, borderTopColor: C.border },
          ]}
        >
          <TextInput
            style={[
              styles.input,
              { backgroundColor: C.background, color: C.text.primary },
            ]}
            placeholder="Post your reply"
            placeholderTextColor={C.text.muted}
            value={textInput}
            onChangeText={setTextInput}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !textInput.trim() && { opacity: 0.5 }]}
            onPress={handleSendText}
            disabled={!textInput.trim() || isSending}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="arrow-up" size={20} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 50 : 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  originalYapContainer: { marginBottom: 8 },
  separator: { height: StyleSheet.hairlineWidth, marginTop: 10 },
  listContent: { paddingBottom: 100 },
  commentItem: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  avatarContainer: { alignItems: "center", marginRight: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: {
    backgroundColor: "#FF6B35",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: "#FFF", fontWeight: "bold" },
  threadLine: { width: 2, flex: 1, marginTop: 8, borderRadius: 1 },
  commentContent: { flex: 1 },
  username: { fontWeight: "700", fontSize: 14, marginBottom: 2 },
  commentText: { fontSize: 15, lineHeight: 20 },
  voiceBubble: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 12,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  waveformContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: 8,
  },
  waveBar: { width: 3, borderRadius: 1.5 },
  commentActions: { flexDirection: "row", marginTop: 10 },
  actionButton: { flexDirection: "row", alignItems: "center", marginRight: 24 },
  actionText: { fontSize: 12, marginLeft: 4, fontWeight: "600" },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    paddingBottom: Platform.OS === "ios" ? 34 : 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FF6B35",
    marginLeft: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
