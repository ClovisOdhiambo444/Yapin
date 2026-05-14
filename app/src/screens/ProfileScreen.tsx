import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Image,
  FlatList,
  Modal,
  RefreshControl,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";
import { useTheme } from "../theme/ThemeContext";
import { Colors, LightColors } from "../theme/colors";
import { Spacing } from "../theme/spacing";
import {
  auth,
  logout,
  getUserProfile,
  updateProfile,
  isLiked,
  likeYap,
  unlikeYap,
  addReaction,
  echoYap,
  getCurrentUsername,
  db,
} from "../services/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  limit,
} from "firebase/firestore";
import YapCard from "../components/YapCard";

export default function ProfileScreen({ navigation }: any) {
  const { isDark } = useTheme();
  const C = isDark ? Colors : LightColors;

  const [profile, setProfile] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [socials, setSocials] = useState({
    instagram: "",
    x: "",
    linkedin: "",
    facebook: "",
    reddit: "",
  });

  const [yaps, setYaps] = useState<any[]>([]);
  const [likedYaps, setLikedYaps] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [modalType, setModalType] = useState<"followers" | "following" | null>(
    null,
  );
  const [usersList, setUsersList] = useState<any[]>([]);

  const sound = useRef<Audio.Sound | null>(null);
  const posInterval = useRef<NodeJS.Timeout | null>(null);
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    loadProfile();

    // Listen for real-time count updates
    const unsubFollowers = onSnapshot(
      collection(db, "users", user.uid, "followers"),
      (s) => setProfile((p: any) => ({ ...p, followerCount: s.size })),
    );
    const unsubFollowing = onSnapshot(
      collection(db, "users", user.uid, "following"),
      (s) => setProfile((p: any) => ({ ...p, followingCount: s.size })),
    );

    // Listen for user's Yaps
    const q = query(
      collection(db, "yaps"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(50),
    );
    const unsubYaps = onSnapshot(q, async (s) => {
      const yl = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      setYaps(yl);
    });

    return () => {
      unsubFollowers();
      unsubFollowing();
      unsubYaps();
      cleanupAudio();
    };
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    const d = await getUserProfile(user.uid);
    setProfile(d);
    setBio(d?.bio || "");
    setSocials(
      d?.socials || {
        instagram: "",
        x: "",
        linkedin: "",
        facebook: "",
        reddit: "",
      },
    );
  };

  const cleanupAudio = async () => {
    if (sound.current) await sound.current.unloadAsync();
    if (posInterval.current) clearInterval(posInterval.current);
    setPlayingId(null);
  };

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && user) {
      const uri = result.assets[0].uri;
      // Cloudinary Logic - Keep it here for simplicity, or move to an upload helper
      const fd = new FormData();
      fd.append("file", { uri, type: "image/jpeg", name: "avatar.jpg" } as any);
      fd.append("upload_preset", "yapin_uploads");

      try {
        const res = await fetch(
          "https://api.cloudinary.com/v1_1/dpbs080al/upload",
          { method: "POST", body: fd },
        );
        const data = await res.json();
        if (data.secure_url) {
          await updateProfile(user.uid, { avatarUrl: data.secure_url });
          setProfile((p: any) => ({ ...p, avatarUrl: data.secure_url }));
        }
      } catch (e) {
        Alert.alert("Upload failed", "Could not update avatar.");
      }
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    await updateProfile(user.uid, { bio, socials });
    setEditing(false);
    loadProfile();
  };

  const fetchUsers = async (type: "followers" | "following") => {
    if (!user) return;
    const snap = await getDocs(collection(db, "users", user.uid, type));
    const list = await Promise.all(
      snap.docs.map(async (docRef) => {
        const uDoc = await getDoc(doc(db, "users", docRef.id));
        return { id: docRef.id, ...uDoc.data() };
      }),
    );
    setUsersList(list);
    setModalType(type);
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <FlatList
        data={yaps}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            {/* Top Navigation Bar */}
            <View style={[styles.navBar, { borderBottomColor: C.border }]}>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Ionicons
                  name="chevron-back"
                  size={28}
                  color={C.text.primary}
                />
              </TouchableOpacity>
              <Text style={[styles.navTitle, { color: C.text.primary }]}>
                Profile
              </Text>
              <TouchableOpacity
                onPress={() =>
                  Alert.alert("Logout", "Are you sure?", [
                    { text: "Cancel" },
                    { text: "Logout", onPress: logout, style: "destructive" },
                  ])
                }
              >
                <Ionicons name="log-out-outline" size={24} color="#FF4B4B" />
              </TouchableOpacity>
            </View>

            {/* Profile Info */}
            <View style={styles.profileInfo}>
              <TouchableOpacity
                onPress={pickAvatar}
                style={styles.avatarWrapper}
              >
                {profile?.avatarUrl ? (
                  <Image
                    source={{ uri: profile.avatarUrl }}
                    style={styles.avatar}
                  />
                ) : (
                  <View
                    style={[
                      styles.avatar,
                      {
                        backgroundColor: C.accent,
                        justifyContent: "center",
                        alignItems: "center",
                      },
                    ]}
                  >
                    <Text style={styles.avatarLetter}>
                      {profile?.username?.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.editIcon}>
                  <Ionicons name="camera" size={14} color="#FFF" />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.editBtn, { borderColor: C.border }]}
                onPress={() => setEditing(!editing)}
              >
                <Text style={{ color: C.text.primary, fontWeight: "700" }}>
                  {editing ? "Cancel" : "Edit Profile"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.nameBlock}>
              <Text style={[styles.displayName, { color: C.text.primary }]}>
                {profile?.username}
              </Text>
              <Text style={{ color: C.text.muted }}>
                @{profile?.username?.toLowerCase()}
              </Text>
            </View>

            {editing ? (
              <View style={styles.editSection}>
                <TextInput
                  style={[
                    styles.bioInput,
                    {
                      backgroundColor: C.surface,
                      color: C.text.primary,
                      borderColor: C.border,
                    },
                  ]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Write something about yourself..."
                  multiline
                />
                <TouchableOpacity style={styles.saveBtn} onPress={saveProfile}>
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.statsRow}>
                <TouchableOpacity
                  onPress={() => fetchUsers("following")}
                  style={styles.statItem}
                >
                  <Text style={[styles.statNum, { color: C.text.primary }]}>
                    {profile?.followingCount || 0}
                  </Text>
                  <Text style={{ color: C.text.muted }}>Following</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => fetchUsers("followers")}
                  style={styles.statItem}
                >
                  <Text style={[styles.statNum, { color: C.text.primary }]}>
                    {profile?.followerCount || 0}
                  </Text>
                  <Text style={{ color: C.text.muted }}>Followers</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={[styles.tabBar, { borderBottomColor: C.border }]}>
              <View style={[styles.tab, { borderBottomColor: C.accent }]}>
                <Text style={[styles.tabText, { color: C.text.primary }]}>
                  Voices
                </Text>
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => <YapCard {...item} />}
      />

      {/* Followers/Following Modal */}
      <Modal visible={!!modalType} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setModalType(null)}
          activeOpacity={1}
        >
          <View style={[styles.modalContent, { backgroundColor: C.surface }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: C.text.primary }]}>
              {modalType === "followers" ? "Followers" : "Following"}
            </Text>
            <FlatList
              data={usersList}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userRow}
                  onPress={() => {
                    setModalType(null);
                    navigation.navigate("UserProfile", { userId: item.id });
                  }}
                >
                  <Image
                    source={{ uri: item.avatarUrl }}
                    style={styles.userAv}
                  />
                  <Text style={{ color: C.text.primary, fontWeight: "600" }}>
                    @{item.username}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 60 : 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navTitle: { fontSize: 18, fontWeight: "800" },
  headerContainer: { paddingBottom: 10 },
  profileInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 16,
  },
  avatarWrapper: { position: "relative" },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "#FFF",
  },
  avatarLetter: { color: "#FFF", fontSize: 32, fontWeight: "800" },
  editIcon: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "#FF6B35",
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFF",
  },
  editBtn: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginTop: 10,
  },
  nameBlock: { paddingHorizontal: 16, marginBottom: 12 },
  displayName: { fontSize: 22, fontWeight: "900" },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 20,
    marginBottom: 16,
  },
  statItem: { flexDirection: "row", gap: 5, alignItems: "center" },
  statNum: { fontWeight: "800", fontSize: 16 },
  editSection: { paddingHorizontal: 16, gap: 10 },
  bioInput: {
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    borderWidth: 1,
    textAlignVertical: "top",
  },
  saveBtn: {
    backgroundColor: "#FF6B35",
    padding: 12,
    borderRadius: 25,
    alignItems: "center",
  },
  saveBtnText: { color: "#FFF", fontWeight: "800" },
  tabBar: { flexDirection: "row", marginTop: 10, borderBottomWidth: 1 },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 3,
  },
  tabText: { fontWeight: "800", fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    height: "70%",
    padding: 20,
  },
  modalHandle: {
    width: 40,
    height: 5,
    backgroundColor: "#DDD",
    borderRadius: 3,
    alignSelf: "center",
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 20,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  userAv: { width: 40, height: 40, borderRadius: 20 },
});
