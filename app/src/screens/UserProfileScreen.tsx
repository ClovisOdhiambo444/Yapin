import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, FlatList, Modal, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useTheme } from '../theme/ThemeContext';
import { Colors, LightColors } from '../theme/colors';
import { Spacing } from '../theme/spacing';
import { auth, getUserProfile, followUser, unfollowUser, isFollowing, isLiked, likeYap, unlikeYap, echoYap, getCurrentUsername, addReaction, deleteYap, db } from '../services/firebase';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot, orderBy, limit } from 'firebase/firestore';
import YapCard from '../components/YapCard';

export default function UserProfileScreen({ route, navigation }: any) {
  const { userId } = route.params;
  const { isDark } = useTheme();
  const C = isDark ? Colors : LightColors;

  const [profile, setProfile] = useState<any>(null);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [loadingFollow, setLoadingFollow] = useState(true);
  const [loading, setLoading] = useState(true);
  const [yaps, setYaps] = useState<any[]>([]);
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

  // Real-time listener for profile counts
  useEffect(() => {
    if (!userId) return;
    const unsubProfile = onSnapshot(doc(db, "users", userId), (docSnap) => {
      if (docSnap.exists()) setProfile({ id: docSnap.id, ...docSnap.data() });
    });

    let unsubFollow: (() => void) = () => {};
    if (currentUser && !isOwnProfile) {
      unsubFollow = onSnapshot(doc(db, "users", currentUser.uid, "following", userId), (docSnap) => {
        setIsFollowingUser(docSnap.exists());
        setLoadingFollow(false);
      });
    } else {
      setLoadingFollow(false);
    }

    return () => { unsubProfile(); unsubFollow(); };
  }, [userId, currentUser]);

  // Yaps listener
  useEffect(() => {
    if (!userId) return;
    const q = query(collection(db, "yaps"), where("userId", "==", userId), orderBy("createdAt", "desc"), limit(50));
    const unsub = onSnapshot(q, (s) => setYaps(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    setLoading(false);
    return unsub;
  }, [userId]);

  const cleanupAudio = async () => { if (sound.current) await sound.current.unloadAsync(); if (posInterval.current) clearInterval(posInterval.current); setPlayingId(null); };

  const handleFollowToggle = async () => {
    if (!currentUser) return;
    const prev = isFollowingUser;
    setIsFollowingUser(!prev);
    try { if (prev) await unfollowUser(currentUser.uid, userId); else await followUser(currentUser.uid, userId); }
    catch (e) { setIsFollowingUser(prev); }
  };

  const playYap = async (id: string, url: string) => { if (playingId === id) { if (sound.current) { const st = await sound.current.getStatusAsync(); st.isLoaded && st.isPlaying ? await sound.current.pauseAsync() : await sound.current.playAsync(); } return; } await cleanupAudio(); const { sound: ns } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true }, (st: any) => { if (st.didJustFinish) cleanupAudio(); }); sound.current = ns; setPlayingId(id); posInterval.current = setInterval(async () => { const st = await sound.current?.getStatusAsync(); if (st?.isLoaded && st.durationMillis) setPlaybackPosition(st.positionMillis / st.durationMillis); }, 100); };

  const handleLike = async (yap: any) => { if (!currentUser) return; const tid = yap.echoedYapId || yap.id; if (likedYaps.has(yap.id)) { await unlikeYap(tid, currentUser.uid); setLikedYaps(p => { const n = new Set(p); n.delete(yap.id); return n; }); } else { await likeYap(tid, currentUser.uid); setLikedYaps(p => new Set(p).add(yap.id)); } };

  const handleDelete = (yap: any) => { Alert.alert("Delete Yap?", "This cannot be undone.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: async () => { try { await deleteYap(yap.id, currentUser!.uid); } catch (e: any) { Alert.alert("Error", e.message); } } }]); };

  const fetchList = async (type: 'followers' | 'following') => { const s = await getDocs(collection(db, "users", userId, type)); const l = await Promise.all(s.docs.map(async (d) => { const u = await getDoc(doc(db, "users", d.id)); return { id: d.id, ...u.data() }; })); setUserListData(l); setModalType(type); };

  if (loading) return <View style={{ flex: 1, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={C.accent} size="large" /></View>;

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <FlatList
        data={yaps} keyExtractor={item => item.id}
        ListHeaderComponent={<View>
          <View style={[styles.h, { borderBottomColor: C.border }]}><TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="chevron-back" size={28} color={C.text.primary} /></TouchableOpacity><Text style={[styles.ht, { color: C.text.primary }]}>@{profile?.username}</Text><View style={{ width: 28 }} /></View>
          <View style={styles.tr}><View>{profile?.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={styles.av} /> : <View style={[styles.av, { backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center' }]}><Text style={{ color: '#FFF', fontSize: 30, fontWeight: '800' }}>{profile?.username?.charAt(0)?.toUpperCase()}</Text></View>}</View>{!isOwnProfile && <TouchableOpacity onPress={handleFollowToggle} style={[styles.fb, { backgroundColor: isFollowingUser ? 'transparent' : C.accent, borderColor: isFollowingUser ? C.border : C.accent, borderWidth: 1 }]}>{loadingFollow ? <ActivityIndicator size="small" color={C.text.primary} /> : <Text style={{ color: isFollowingUser ? C.text.primary : '#FFF', fontWeight: 'bold' }}>{isFollowingUser ? 'Following' : 'Follow'}</Text>}</TouchableOpacity>}</View>
          <Text style={[styles.dn, { color: C.text.primary }]}>@{profile?.username}</Text>
          {profile?.bio ? <Text style={[styles.bio, { color: C.text.secondary }]}>{profile.bio}</Text> : null}
          <View style={styles.sr}><TouchableOpacity onPress={() => fetchList('following')} style={styles.si}><Text style={[styles.sn, { color: C.text.primary }]}>{profile?.followingCount || 0}</Text><Text style={{ color: C.text.muted, fontSize: 13 }}>Following</Text></TouchableOpacity><TouchableOpacity onPress={() => fetchList('followers')} style={styles.si}><Text style={[styles.sn, { color: C.text.primary }]}>{profile?.followerCount || 0}</Text><Text style={{ color: C.text.muted, fontSize: 13 }}>Followers</Text></TouchableOpacity></View>
          <View style={[styles.tabs, { borderBottomColor: C.border }]}><View style={[styles.tab, { borderBottomColor: C.accent }]}><Text style={[styles.tabT, { color: C.text.primary }]}>Voices</Text></View></View>
        </View>}
        renderItem={({ item }) => (<YapCard {...item} isLiked={likedYaps.has(item.id)} isPlaying={playingId === item.id} playbackPosition={playingId === item.id ? playbackPosition : 0} onPlayPress={() => playYap(item.id, item.audioUrl)} onLikePress={() => handleLike(item)} onConvoPress={() => navigation.navigate('Convo', { yapId: item.id, yap: item })} onUsernamePress={() => {}} onDeletePress={() => isOwnProfile && handleDelete(item)} />)}
        contentContainerStyle={{ paddingBottom: 100 }}
      />
      <Modal visible={!!modalType} transparent animationType="slide"><TouchableOpacity style={styles.mo} onPress={() => setModalType(null)} activeOpacity={1}><View style={[styles.mc, { backgroundColor: C.surface }]}><Text style={[styles.mt, { color: C.text.primary }]}>{modalType === 'followers' ? 'Followers' : 'Following'}</Text><FlatList data={userListData} keyExtractor={item => item.id} renderItem={({ item }) => (<TouchableOpacity style={styles.ur} onPress={() => { setModalType(null); navigation.push('UserProfile', { userId: item.id }); }}>{item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={styles.ua} /> : <View style={[styles.ua, { backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center' }]}><Text style={{ color: '#FFF', fontWeight: '700' }}>{item.username?.charAt(0)?.toUpperCase()}</Text></View>}<Text style={{ color: C.text.primary, fontWeight: '600' }}>@{item.username}</Text></TouchableOpacity>)} /></View></TouchableOpacity></Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  h: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  ht: { fontSize: 17, fontWeight: '800' },
  tr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  av: { width: 75, height: 75, borderRadius: 38 },
  fb: { paddingHorizontal: 25, paddingVertical: 8, borderRadius: 20, minWidth: 100, alignItems: 'center' },
  dn: { fontSize: 20, fontWeight: '900', paddingHorizontal: 16, marginBottom: 5 },
  bio: { fontSize: 15, lineHeight: 20, paddingHorizontal: 16, marginBottom: 15 },
  sr: { flexDirection: 'row', gap: 20, paddingHorizontal: 16, marginBottom: 15 },
  si: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  sn: { fontWeight: '800', fontSize: 15 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, marginTop: 5 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 3 },
  tabT: { fontWeight: '800', fontSize: 15 },
  mo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  mc: { height: '70%', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20 },
  mt: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 15 },
  ur: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  ua: { width: 40, height: 40, borderRadius: 20 },
});
