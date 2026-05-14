import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Audio } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { Colors, LightColors } from "../theme/colors";
import { Spacing } from "../theme/spacing";
import {
  listenToHashtag,
  auth,
  isLiked,
  likeYap,
  unlikeYap,
} from "../services/firebase";
import YapCard from "../components/YapCard";

export default function HashtagScreen({ route, navigation }: any) {
  const { hashtag } = route.params;
  const { isDark } = useTheme();
  const C = isDark ? Colors : LightColors;

  const [yaps, setYaps] = useState<any[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [likedYaps, setLikedYaps] = useState<Set<string>>(new Set());

  const sound = useRef<Audio.Sound | null>(null);
  const posInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const unsub = listenToHashtag(hashtag, (fetchedYaps) => {
      setYaps(fetchedYaps);
      syncLikes(fetchedYaps);
    });

    return () => {
      unsub();
      cleanupAudio();
    };
  }, [hashtag]);

  const syncLikes = async (data: any[]) => {
    const u = auth.currentUser;
    if (!u) return;
    const likedSet = new Set<string>();
    await Promise.all(
      data.map(async (y) => {
        if (await isLiked(y.id, u.uid)) likedSet.add(y.id);
      }),
    );
    setLikedYaps(likedSet);
  };

  const cleanupAudio = async () => {
    if (sound.current) {
      await sound.current.unloadAsync();
      sound.current = null;
    }
    if (posInterval.current) clearInterval(posInterval.current);
    setPlayingId(null);
    setPlaybackPosition(0);
  };

  const playYap = async (id: string, url: string) => {
    if (playingId === id) {
      if (sound.current) {
        const st = await sound.current.getStatusAsync();
        if (st.isLoaded)
          st.isPlaying
            ? await sound.current.pauseAsync()
            : await sound.current.playAsync();
      }
      return;
    }

    await cleanupAudio();
    const { sound: newSound } = await Audio.Sound.createAsync(
      { uri: url },
      { shouldPlay: true },
      (st: any) => {
        if (st.didJustFinish) cleanupAudio();
      },
    );
    sound.current = newSound;
    setPlayingId(id);

    posInterval.current = setInterval(async () => {
      const st = await sound.current?.getStatusAsync();
      if (st?.isLoaded && st.durationMillis) {
        setPlaybackPosition(st.positionMillis / st.durationMillis);
      }
    }, 100);
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      {/* Refined Header */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={28} color={C.text.primary} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.hashtagHash, { color: C.accent }]}>#</Text>
          <Text style={[styles.title, { color: C.text.primary }]}>
            {hashtag.replace("#", "")}
          </Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      <FlatList
        data={yaps}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <YapCard
            {...item}
            isLiked={likedYaps.has(item.id)}
            isPlaying={playingId === item.id}
            playbackPosition={playingId === item.id ? playbackPosition : 0}
            onPlayPress={() => playYap(item.id, item.audioUrl)}
            onLikePress={async () => {
              const u = auth.currentUser;
              if (!u) return;
              if (likedYaps.has(item.id)) {
                setLikedYaps((p) => {
                  const n = new Set(p);
                  n.delete(item.id);
                  return n;
                });
                await unlikeYap(item.id, u.uid);
              } else {
                setLikedYaps((p) => new Set(p).add(item.id));
                await likeYap(item.id, u.uid);
              }
            }}
            onConvoPress={() =>
              navigation.navigate("Convo", { yapId: item.id, yap: item })
            }
            onUsernamePress={() =>
              navigation.navigate("UserProfile", { userId: item.userId })
            }
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={48} color={C.text.muted} />
            <Text style={[styles.emptyText, { color: C.text.muted }]}>
              No Yaps found for this hashtag
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 55 : 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleContainer: { flexDirection: "row", alignItems: "center" },
  hashtagHash: { fontSize: 22, fontWeight: "800", marginRight: 2 },
  title: { fontSize: 20, fontWeight: "800" },
  content: { paddingBottom: 40 },
  empty: { alignItems: "center", marginTop: 120, paddingHorizontal: 40 },
  emptyText: {
    textAlign: "center",
    marginTop: 12,
    fontSize: 16,
    fontWeight: "500",
  },
});
