import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, FlatList,
  Modal, ActivityIndicator, RefreshControl, Platform, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useTheme } from '../theme/ThemeContext';
import { Colors, LightColors } from '../theme/colors';
import { Spacing } from '../theme/spacing';
import {
  auth, getUserProfile, followUser, unfollowUser, isFollowing,
  isLiked, likeYap, unlikeYap, echoYap, getCurrentUsername,
  deleteYap, db,
} from '../services/firebase';
import {
  collection, query, where, getDocs, doc, getDoc,
  onSnapshot, orderBy, limit,
} from 'firebase/firestore';
import YapCard from '../components/YapCard';
import { useProfilePic } from '../theme/ProfilePicContext';

const SOCIAL_PLATFORMS = [
  { key: 'instagram', icon: 'logo-instagram', color: '#E4405F' },
  { key: 'twitter',   icon: 'logo-twitter',   color: '#1DA1F2' },
  { key: 'tiktok',    icon: 'logo-tiktok',    color: '#FFFFFF' },
  { key: 'snapchat',  icon: 'logo-snapchat',  color: '#FFFC00' },
  { key: 'reddit',    icon: 'logo-reddit',    color: '#FF4500' },
  { key: 'linkedin',  icon: 'logo-linkedin',  color: '#0A66C2' },
  { key: 'facebook',  icon: 'logo-facebook',  color: '#1877F2' },
];

export default function UserProfileScreen({ route, navigation }: any) {
  const { userId } = route.params;
  const { isDark } = useTheme();
  const C = isDark ? Colors : LightColors;

  const [profile, setProfile] = useState<any>(null);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [loadingFollow, setLoadingFollow] = useState(true);
  const [loading, setLoading] = useState(true);

  const [yaps, setYaps] = useState<any[]>([]);
  const [echoes, setEchoes] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'yaps' | 'echoes'>('yaps');

  const [likedYaps, setLikedYaps] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const [modalType, setModalType] = useState<'followers' | 'following' | null>(null);
  const [userListData, setUserListData] = useState<any[]>([]);

  const sound = useRef<Audio.Sound | null>(null);
  const posInterval = useRef<NodeJS.Timeout | null>(null);
  const currentUser = auth.currentUser;
  const isOwnProfile = currentUser?.uid === userId;
  const { recentAvatars } = useProfilePic();

  // ── real‑time counts ──
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [followingCount, setFollowingCount] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    const unsubF = onSnapshot(collection(db, 'users', userId, 'followers'), s => setFollowerCount(s.size));
    const unsubG = onSnapshot(collection(db, 'users', userId, 'following'), s => setFollowingCount(s.size));
    return () => { unsubF(); unsubG(); };
  }, [userId]);

  // follow status
  useEffect(() => {
    if (!currentUser || isOwnProfile || !userId) { setLoadingFollow(false); return; }
    const unsub = onSnapshot(doc(db, 'users', currentUser.uid, 'following', userId), snap => {
      setIsFollowingUser(snap.exists());
      setLoadingFollow(false);
    });
    return unsub;
  }, [userId, currentUser]);

  // profile
  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(doc(db, 'users', userId), snap => {
      if (snap.exists()) { setProfile({ id: snap.id, ...snap.data() }); setLoading(false); }
    });
    return unsub;
  }, [userId]);

  // yaps + echoes
  useEffect(() => {
    if (!userId) return;
    const qAll = query(collection(db, 'yaps'), where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(50));
    const unsubYaps = onSnapshot(qAll, async snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setYaps(all.filter((y: any) => !y.echoedYapId));
      setEchoes(all.filter((y: any) => y.echoedYapId));
      if (currentUser) {
        for (const y of all) {
          if (await isLiked(y.id, currentUser.uid)) setLikedYaps(p => new Set(p).add(y.id));
        }
      }
    });
    return unsubYaps;
  }, [userId, currentUser]);

  // audio
  const cleanupAudio = async () => {
    if (sound.current) { await sound.current.unloadAsync(); sound.current = null; }
    if (posInterval.current) clearInterval(posInterval.current);
    setPlayingId(null); setPlaybackPosition(0);
  };
  useEffect(() => {
    if (sound && playingId) {
      posInterval.current = setInterval(async () => {
        const st = await sound.getStatusAsync();
        if (st.isLoaded && st.durationMillis) setPlaybackPosition(st.positionMillis / st.durationMillis);
      }, 100);
    } else { if (posInterval.current) clearInterval(posInterval.current); setPlaybackPosition(0); }
    return () => { if (posInterval.current) clearInterval(posInterval.current); };
  }, [sound, playingId]);

  const handleFollowToggle = async () => {
    if (!currentUser) return;
    const prev = isFollowingUser; setIsFollowingUser(!prev);
    try { if (prev) await unfollowUser(currentUser.uid, userId); else await followUser(currentUser.uid, userId); }
    catch (e) { setIsFollowingUser(prev); }
  };

  const playYap = async (id: string, url: string) => {
    if (playingId === id) {
      if (sound.current) { const st = await sound.getStatusAsync(); st.isLoaded && st.isPlaying ? await sound.current.pauseAsync() : await sound.current.playAsync(); }
      return;
    }
    await cleanupAudio();
    const { sound: ns } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true }, (st: any) => { if (st.didJustFinish) cleanupAudio(); });
    sound.current = ns; setPlayingId(id);
    posInterval.current = setInterval(async () => {
      const st = await sound.current?.getStatusAsync();
      if (st?.isLoaded && st.durationMillis) setPlaybackPosition(st.positionMillis / st.durationMillis);
    }, 100);
  };

  const handleLike = async (yap: any) => {
    if (!currentUser) return;
    const tid = yap.echoedYapId || yap.id;
    if (likedYaps.has(yap.id)) { await unlikeYap(tid, currentUser.uid); setLikedYaps(p => { const n = new Set(p); n.delete(yap.id); return n; }); }
    else { await likeYap(tid, currentUser.uid); setLikedYaps(p => new Set(p).add(yap.id)); }
  };

  const handleDelete = (yap: any) => {
    Alert.alert('Delete Yap?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteYap(yap.id, currentUser!.uid); } catch (e: any) { Alert.alert('Error', e.message); } } },
    ]);
  };

  const fetchList = async (type: 'followers' | 'following') => {
    const snap = await getDocs(collection(db, 'users', userId, type));
    const list = await Promise.all(snap.docs.map(async d => { const u = await getDoc(doc(db, 'users', d.id)); return { id: d.id, ...u.data() }; }));
    setUserListData(list); setModalType(type);
  };

  const openLink = (url: string) => { const full = url.startsWith('http') ? url : 'https://' + url; Linking.openURL(full).catch(() => {}); };

  if (loading) return <View style={[styles.loading, { backgroundColor: C.background }]}><ActivityIndicator color={C.accent} size="large" /></View>;

  return (
    <View style={[styles.c, { backgroundColor: C.background }]}>
      <FlatList
        data={activeTab === 'yaps' ? yaps : echoes}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); setProfile(await getUserProfile(userId)); setRefreshing(false); }} tintColor={C.accent} />}
        ListHeaderComponent={
          <View>
            <View style={[styles.h, { borderBottomColor: C.border }]}>
              <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="chevron-back" size={28} color={C.text.primary} /></TouchableOpacity>
              <Text style={[styles.ht, { color: C.text.primary }]}>@{profile?.username}</Text>
              <View style={{ width: 28 }} />
            </View>

            {/* Profile info */}
            <View style={styles.profileInfo}>
              <View style={styles.avatarContainer}>
                {profile?.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={styles.av} /> :
                  <View style={[styles.av, { backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center' }]}><Text style={{ color: '#FFF', fontSize: 30, fontWeight: '800' }}>{profile?.username?.charAt(0)?.toUpperCase()}</Text></View>}
              </View>
              <Text style={[styles.displayName, { color: C.text.primary }]}>@{profile?.username}</Text>
              {profile?.bio ? <Text style={[styles.bio, { color: C.text.secondary }]}>{profile.bio}</Text> : null}

              {/* Social icons */}
              {profile?.socials && Object.values(profile.socials).some((v: any) => v) && (
                <View style={styles.socialIconsRow}>
                  {SOCIAL_PLATFORMS.map(p => { const link = profile.socials?.[p.key]; if (!link) return null; return <TouchableOpacity key={p.key} onPress={() => openLink(link)} style={{ padding: 6 }}><Ionicons name={p.icon as any} size={22} color={p.color} /></TouchableOpacity>; })}
                </View>
              )}

              {/* Counts */}
              <View style={styles.countsRow}>
                <View style={styles.countItem}><Text style={styles.countNum}>{yaps.length + echoes.length}</Text><Text style={styles.countLabel}>Yaps</Text></View>
                <View style={styles.countDivider} />
                <TouchableOpacity style={styles.countItem} onPress={() => fetchList('following')}><Text style={styles.countNum}>{followingCount ?? '…'}</Text><Text style={styles.countLabel}>Following</Text></TouchableOpacity>
                <View style={styles.countDivider} />
                <TouchableOpacity style={styles.countItem} onPress={() => fetchList('followers')}><Text style={styles.countNum}>{followerCount ?? '…'}</Text><Text style={styles.countLabel}>Followers</Text></TouchableOpacity>
              </View>

              {/* Follow button */}
              {!isOwnProfile && (
                <TouchableOpacity onPress={handleFollowToggle} style={[styles.fb, { backgroundColor: isFollowingUser ? 'transparent' : C.accent, borderColor: isFollowingUser ? C.border : C.accent, borderWidth: 1 }]}>
                  {loadingFollow ? <ActivityIndicator size="small" color={C.text.primary} /> : <Text style={{ color: isFollowingUser ? C.text.primary : '#FFF', fontWeight: 'bold' }}>{isFollowingUser ? 'Following' : 'Follow'}</Text>}
                </TouchableOpacity>
              )}
            </View>

            {/* Tabs */}
            <View style={styles.tabRow}>
              <TouchableOpacity style={[styles.tab, activeTab === 'yaps' && styles.tabActive]} onPress={() => setActiveTab('yaps')}>
                <Text style={[styles.tabText, activeTab === 'yaps' && styles.tabTextActive]}>Yaps</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tab, activeTab === 'echoes' && styles.tabActive]} onPress={() => setActiveTab('echoes')}>
                <Text style={[styles.tabText, activeTab === 'echoes' && styles.tabTextActive]}>Echoes</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <YapCard
            yapId={item.id} username={item.username} avatarUrl={item.avatarUrl}
            duration={item.duration} hashtags={item.hashtags || []} caption={item.caption}
            echoedUsername={item.echoedUsername} convoCount={item.convoCount || 0}
            echoCount={item.echoCount || 0} likeCount={item.likeCount || 0}
            isLiked={likedYaps.has(item.id)} isPlaying={playingId === item.id}
            playbackPosition={playingId === item.id ? playbackPosition : 0}
            userId={item.userId}
            onPlayPress={() => playYap(item.id, item.audioUrl)}
            onLikePress={() => handleLike(item)}
            onConvoPress={() => navigation.navigate('Convo', { yapId: item.id, yap: item })}
            onEchoPress={async () => { if (!currentUser) return; await echoYap(currentUser.uid, await getCurrentUsername(currentUser.uid), item.id, ''); }}
            onUsernamePress={() => {}}
            onDeletePress={() => isOwnProfile && handleDelete(item)}
          />
        )}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {/* Followers/Following Modal */}
      <Modal visible={!!modalType} transparent animationType="slide">
        <TouchableOpacity style={styles.mo} onPress={() => setModalType(null)} activeOpacity={1}>
          <View style={[styles.mc, { backgroundColor: C.surface }]}>
            <Text style={[styles.mt, { color: C.text.primary }]}>{modalType === 'followers' ? 'Followers' : 'Following'}</Text>
            <FlatList data={userListData} keyExtractor={item => item.id} renderItem={({ item }) => (
              <TouchableOpacity style={styles.ur} onPress={() => { setModalType(null); navigation.push('UserProfile', { userId: item.id }); }}>
                {item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={styles.ua} /> : <View style={[styles.ua, { backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center' }]}><Text style={{ color: '#FFF', fontWeight: '700' }}>{item.username?.charAt(0)?.toUpperCase()}</Text></View>}
                <View style={{ flex: 1 }}><Text style={{ color: C.text.primary, fontWeight: '600' }}>@{item.username}</Text><Text style={{ color: C.text.muted, fontSize: 12 }} numberOfLines={1}>{item.bio || ''}</Text></View>
              </TouchableOpacity>
            )} />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  h: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'ios' ? 60 : 20, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  ht: { fontSize: 17, fontWeight: '800' },
  profileInfo: { padding: 16, alignItems: 'center' },
  avatarContainer: { marginBottom: 12 },
  av: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#FF6B35' },
  displayName: { fontSize: 22, fontWeight: '900', marginTop: 8 },
  bio: { fontSize: 15, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 12, paddingHorizontal: 16 },
  socialIconsRow: { flexDirection: 'row', gap: 12, marginBottom: 16, justifyContent: 'center' },
  countsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  countItem: { alignItems: 'center', paddingHorizontal: 16 },
  countNum: { color: '#FFF', fontWeight: '800', fontSize: 18 },
  countLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 2 },
  countDivider: { width: 0.5, height: 24, backgroundColor: 'rgba(255,255,255,0.15)' },
  fb: { paddingHorizontal: 25, paddingVertical: 8, borderRadius: 20, minWidth: 100, alignItems: 'center', marginBottom: 8 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.1)' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 3, borderBottomColor: '#FF6B35' },
  tabText: { color: 'rgba(255,255,255,0.5)', fontWeight: '600', fontSize: 15 },
  tabTextActive: { color: '#FFF', fontWeight: '700' },
  mo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  mc: { borderTopLeftRadius: 25, borderTopRightRadius: 25, height: '70%', padding: 20 },
  mt: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 15 },
  ur: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  ua: { width: 40, height: 40, borderRadius: 20 },
});
