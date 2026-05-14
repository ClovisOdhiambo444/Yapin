import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { Colors, LightColors } from '../theme/colors';
import { Spacing } from '../theme/spacing';
import { auth, listenToNotifications } from '../services/firebase';
import { formatDistanceToNow } from 'date-fns';

export default function NotificationsScreen({ navigation }: any) {
  const { isDark } = useTheme();
  const C = isDark ? Colors : LightColors;
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) { setLoading(false); return; }
    const unsub = listenToNotifications(user.uid, (data) => {
      setNotifications(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const getIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'like': return 'heart';
      case 'follow': return 'person-add';
      case 'echo': return 'repeat';
      case 'comment': return 'chatbubble';
      default: return 'notifications';
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case 'like': return '#E0245E';
      case 'follow': return '#1D9BF0';
      case 'echo': return '#00BA7C';
      case 'comment': return C.accent;
      default: return C.text.muted;
    }
  };

  const getMessage = (item: any) => {
    switch (item.type) {
      case 'like': return ' liked your Yap';
      case 'follow': return ' started following you';
      case 'echo': return ' echoed your Yap';
      case 'comment': return ' replied to your Yap';
      default: return '';
    }
  };

  const getTime = (item: any) => {
    if (!item.createdAt) return '';
    try {
      return formatDistanceToNow(item.createdAt.toDate()) + ' ago';
    } catch (e) {
      return '';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <Text style={[styles.title, { color: C.text.primary }]}>Notifications</Text>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={C.accent} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.notifItem, { borderBottomColor: C.border }]}
              onPress={() => {
                if (item.yapId) navigation.navigate('Convo', { yapId: item.yapId, yap: { id: item.yapId } });
                else if (item.fromUserId) navigation.navigate('UserProfile', { userId: item.fromUserId });
              }}
            >
              <View style={styles.iconCol}>
                <Ionicons name={getIcon(item.type)} size={24} color={getIconColor(item.type)} />
              </View>
              <View style={styles.contentCol}>
                <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: item.fromUserId })}>
                  {item.fromAvatarUrl ? (
                    <Image source={{ uri: item.fromAvatarUrl }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, { backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center' }]}>
                      <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{item.fromUsername?.charAt(0)?.toUpperCase()}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <View style={styles.textWrap}>
                  <Text style={[styles.message, { color: C.text.primary }]}>
                    <Text style={{ fontWeight: 'bold' }}>{item.fromUsername}</Text>
                    {getMessage(item)}
                  </Text>
                  <Text style={[styles.time, { color: C.text.muted }]}>{getTime(item)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={64} color={C.text.muted} />
              <Text style={{ color: C.text.muted, marginTop: 10 }}>No notifications yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 60, paddingHorizontal: Spacing.lg, paddingBottom: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 24, fontWeight: '900' },
  notifItem: { flexDirection: 'row', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  iconCol: { width: 40, alignItems: 'center', paddingTop: 4 },
  contentCol: { flex: 1, marginLeft: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginBottom: 8 },
  textWrap: { flexDirection: 'column' },
  message: { fontSize: 15, lineHeight: 20 },
  time: { fontSize: 13, marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', marginTop: 100 },
});
