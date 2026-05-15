import React, { useEffect, useState, useRef } from "react";
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Image, Animated, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { Colors, LightColors } from "../theme/colors";
import { Spacing } from "../theme/spacing";
import {
  auth, listenToNotifications, markNotificationsAsRead,
} from "../services/firebase";

const getRelativeTime = (timestamp: any) => {
  if (!timestamp) return "Just now";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return Math.floor(diffInSeconds / 60) + "m";
  if (diffInSeconds < 86400) return Math.floor(diffInSeconds / 3600) + "h";
  return date.toLocaleDateString();
};

function PulsingAvatar({ avatarUrl, username, color }: { avatarUrl?: string; username: string; color: string }) {
  const pulse1 = useRef(new Animated.Value(1)).current;
  const pulse2 = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim1 = Animated.loop(Animated.sequence([Animated.timing(pulse1, { toValue: 1.8, duration: 1000, useNativeDriver: true }), Animated.timing(pulse1, { toValue: 1, duration: 1000, useNativeDriver: true })]));
    const anim2 = Animated.loop(Animated.sequence([Animated.timing(pulse2, { toValue: 1.8, duration: 1000, useNativeDriver: true, delay: 500 }), Animated.timing(pulse2, { toValue: 1, duration: 1000, useNativeDriver: true })]));
    anim1.start(); anim2.start();
    return () => { anim1.stop(); anim2.stop(); };
  }, []);
  return (
    <View style={{ width: 50, height: 50, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
      <Animated.View style={[s.pulseRing, { borderColor: color + '80', transform: [{ scale: pulse1 }], opacity: pulse1.interpolate({ inputRange: [1, 1.8], outputRange: [0.6, 0] }) }]} />
      <Animated.View style={[s.pulseRing, { borderColor: color + '40', transform: [{ scale: pulse2 }], opacity: pulse2.interpolate({ inputRange: [1, 1.8], outputRange: [0.6, 0] }) }]} />
      {avatarUrl ? <Image source={{ uri: avatarUrl }} style={s.pfp} /> : <View style={[s.pfp, { backgroundColor: color, alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: '#FFF', fontWeight: '700', fontSize: 18 }}>{username?.charAt(0)?.toUpperCase()}</Text></View>}
    </View>
  );
}

export default function NotificationsScreen({ navigation }: any) {
  const { isDark } = useTheme();
  const C = isDark ? Colors : LightColors;
  const [notifications, setNotifications] = useState<any[]>([]);
  const user = auth.currentUser;
  useEffect(() => { if (!user) return; const unsub = listenToNotifications(user.uid, (data) => setNotifications(data.sort((a, b) => b.createdAt - a.createdAt))); return unsub; }, [user]);

  const getIconConfig = (type: string) => {
    switch (type) {
      case "follow": return { name: "person-circle-outline", color: "#FF6B35" };
      case "like": return { name: "sparkles-outline", color: "#FFB347" };
      case "echo": return { name: "pulse-outline", color: "#FFB347" };
      case "comment": return { name: "mic-circle-outline", color: C.accent };
      case "mention": return { name: "at-circle-outline", color: "#FF6B35" };
      case "mention": return " mentioned you in a Yap";
      case "reaction": return { name: "happy", color: "#FFD700" };
      default: return { name: "notifications", color: C.text.muted };
    }
  };

  const getMessage = (item: any) => {
    switch (item.type) {
      case "follow": return " started yapping with you!";
      case "like": return " applauded your Yap";
      case "echo": return " echoed your Yap";
      case "comment":
        return item.commentType === "voice" ? " whispered on your Yap" : " commented on your Yap";
      case "mention": return { name: "at-circle-outline", color: "#FF6B35" };
      case "mention": return " mentioned you in a Yap";
      case "reaction": return " reacted " + (item.reaction || "") + " on your Yap";
      default: return "";
    }
  };

  const handleNotificationPress = async (item: any) => {
    if (!item.read) await markNotificationsAsRead(user!.uid);
    if (item.yapId) navigation.navigate("Convo", { yapId: item.yapId });
    else if (item.fromUserId) navigation.navigate("UserProfile", { userId: item.fromUserId });
  };

  return (
    <View style={[s.container, { backgroundColor: C.background }]}>
      <View style={[s.header, { borderBottomColor: C.border }]}><Text style={[s.title, { color: C.text.primary }]}>Notifications</Text></View>
      <FlatList
        data={notifications} keyExtractor={item => item.id} contentContainerStyle={s.listContent}
        renderItem={({ item }) => {
          const iconConfig = getIconConfig(item.type);
          return (
            <TouchableOpacity style={[s.nItem, !item.read && { backgroundColor: isDark ? 'rgba(255,107,53,0.05)' : 'rgba(255,107,53,0.02)' }]} onPress={() => handleNotificationPress(item)}>
              {item.type === "follow" ? <PulsingAvatar avatarUrl={item.fromAvatarUrl} username={item.fromUsername} color={iconConfig.color} /> :
                <View style={[s.iconContainer, { backgroundColor: iconConfig.color + '20' }]}><Ionicons name={iconConfig.name as any} size={20} color={iconConfig.color} /></View>}
              <View style={s.content}><View style={s.row}>
                {item.type !== "follow" && (item.fromAvatarUrl ? <Image source={{ uri: item.fromAvatarUrl }} style={s.avatar} /> : <View style={[s.avatar, { backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: C.text.primary, fontWeight: '700' }}>{item.fromUsername?.charAt(0)?.toUpperCase()}</Text></View>)}
                <View style={s.textContainer}><Text style={[s.message, { color: C.text.primary }]}><Text style={{ fontWeight: 'bold' }}>{item.fromUsername}</Text>{getMessage(item)}</Text><Text style={[s.time, { color: C.text.muted }]}>{getRelativeTime(item.createdAt)}</Text></View>
              </View></View>
              {!item.read && <View style={[s.unreadDot, { backgroundColor: C.accent }]} />}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<View style={s.empty}><Ionicons name="notifications-off-outline" size={60} color={C.border} /><Text style={[s.emptyText, { color: C.text.muted }]}>Nothing to see here yet</Text></View>}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: Platform.OS === 'ios' ? 60 : 20, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 24, fontWeight: "800" },
  listContent: { paddingBottom: 20 },
  nItem: { flexDirection: "row", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,128,0.2)', alignItems: 'center' },
  pulseRing: { position: 'absolute', width: 50, height: 50, borderRadius: 25, borderWidth: 2 },
  pfp: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#FF6B35' },
  iconContainer: { width: 40, height: 40, borderRadius: 20, marginRight: 12, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12 },
  textContainer: { flex: 1 },
  message: { fontSize: 15, lineHeight: 20 },
  time: { fontSize: 13, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
  empty: { alignItems: "center", marginTop: 120 },
  emptyText: { fontSize: 16, marginTop: 16, fontWeight: '500' },
});
