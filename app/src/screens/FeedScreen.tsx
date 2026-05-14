import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Modal, TextInput, Image, RefreshControl, Switch, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { Colors, LightColors } from '../theme/colors';
import { Spacing } from '../theme/spacing';
import { listenToFeed, listenToFollowingFeed, echoYap, likeYap, unlikeYap, isLiked, getCurrentUsername, addReaction, auth } from '../services/firebase';
import YapCard from '../components/YapCard';

export default function FeedScreen({ navigation }: any) {
  const { isDark, toggleTheme } = useTheme();
  const C = isDark ? Colors : LightColors;
  const [yaps, setYaps] = useState<any[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [feedMode, setFeedMode] = useState<'all' | 'following'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [likedYaps, setLikedYaps] = useState<Set<string>>(new Set());
  const [echoCommentModal, setEchoCommentModal] = useState(false);
  const [echoTarget, setEchoTarget] = useState<any>(null);
  const [echoText, setEchoText] = useState('');
  const sound = useRef<Audio.Sound | null>(null);
  const posInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const handleNewData = (data: any[]) => {
      setYaps(data);
      data.forEach(async (y) => {
        if (await isLiked(y.echoedYapId || y.id, user.uid)) setLikedYaps(p => new Set(p).add(y.id));
      });
    };
    const unsub = feedMode === 'following' ? listenToFollowingFeed(user.uid, handleNewData) : listenToFeed(handleNewData);
    return () => { unsub?.(); if (sound.current) sound.current.unloadAsync(); };
  }, [feedMode]);

  const cleanupAudio = async () => {
    if (sound.current) { await sound.current.unloadAsync(); sound.current = null; }
    if (posInterval.current) clearInterval(posInterval.current);
    setPlayingId(null);
    setPlaybackPosition(0);
  };

  const playYap = async (id: string, url: string) => {
    if (playingId === id) {
      if (sound.current) { const st = await sound.current.getStatusAsync(); if (st.isLoaded) st.isPlaying ? await sound.current.pauseAsync() : await sound.current.playAsync(); }
      return;
    }
    await cleanupAudio();
    const { sound: ns } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true }, (st: any) => { if (st.didJustFinish) cleanupAudio(); });
    sound.current = ns;
    setPlayingId(id);
    posInterval.current = setInterval(async () => {
      const st = await sound.current?.getStatusAsync();
      if (st?.isLoaded && st.durationMillis) setPlaybackPosition(st.positionMillis / st.durationMillis);
    }, 100);
  };

  const handleLike = async (yap: any) => {
    const user = auth.currentUser; if (!user) return;
    const targetId = yap.echoedYapId || yap.id;
    if (likedYaps.has(yap.id)) { setLikedYaps(p => { const n = new Set(p); n.delete(yap.id); return n; }); await unlikeYap(targetId, user.uid); }
    else { setLikedYaps(p => new Set(p).add(yap.id)); await likeYap(targetId, user.uid); }
  };

  const handleEcho = async (yap: any) => { const u = auth.currentUser; if (!u) return; await echoYap(u.uid, await getCurrentUsername(u.uid), yap.id, ''); };
  const handleEchoWithComment = (yap: any) => { setEchoTarget(yap); setEchoText(''); setEchoCommentModal(true); };
  const submitEchoComment = async () => { const u = auth.currentUser; if (!u || !echoTarget) return; await echoYap(u.uid, await getCurrentUsername(u.uid), echoTarget.id, echoText || ''); setEchoCommentModal(false); setEchoTarget(null); };

  const onRefresh = useCallback(() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 1000); }, []);

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          <Image source={require('../../assets/logo.png')} style={styles.headerLogo} />
        </TouchableOpacity>
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, feedMode === 'all' && styles.activeTab]} onPress={() => setFeedMode('all')}>
            <Text style={[styles.tabText, { color: feedMode === 'all' ? C.text.primary : C.text.muted }]}>For You</Text>
            {feedMode === 'all' && <View style={[styles.indicator, { backgroundColor: C.accent }]} />}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, feedMode === 'following' && styles.activeTab]} onPress={() => setFeedMode('following')}>
            <Text style={[styles.tabText, { color: feedMode === 'following' ? C.text.primary : C.text.muted }]}>Following</Text>
            {feedMode === 'following' && <View style={[styles.indicator, { backgroundColor: C.accent }]} />}
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={toggleTheme} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={isDark ? 'moon' : 'sunny-outline'} size={22} color={C.text.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={yaps}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        renderItem={({ item }) => (
          <YapCard
            yapId={item.id} username={item.username} avatarUrl={item.avatarUrl}
            duration={item.duration} hashtags={item.hashtags || []} caption={item.caption}
            echoedUsername={item.echoedUsername} convoCount={item.convoCount || 0}
            echoCount={item.echoCount || 0} likeCount={item.likeCount || 0}
            reactionCount={item.reactionCount || 0}
            isLiked={likedYaps.has(item.id)} isPlaying={playingId === item.id}
            playbackPosition={playingId === item.id ? playbackPosition : 0}
            userId={item.userId}
            onPlayPress={() => playYap(item.id, item.audioUrl)}
            onHashtagPress={(tag) => navigation.navigate('Hashtag', { hashtag: tag })}
            onEchoPress={() => handleEcho(item)}
            onEchoWithComment={() => handleEchoWithComment(item)}
            onConvoPress={() => navigation.navigate('Convo', { yapId: item.id, yap: item })}
            onLikePress={() => handleLike(item)}
            onUsernamePress={() => navigation.navigate('UserProfile', { userId: item.userId })}
            onAvatarPress={() => navigation.navigate('UserProfile', { userId: item.userId })}
            onReaction={(r) => addReaction(item.id, auth.currentUser!.uid, r)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={{ color: C.text.muted }}>No voices here yet. Be the first!</Text>
          </View>
        }
      />

      <Modal visible={echoCommentModal} transparent animationType="slide">
        <TouchableOpacity style={styles.modalBg} onPress={() => setEchoCommentModal(false)} activeOpacity={1}>
          <View style={[styles.echoModal, { backgroundColor: C.surface }]}>
            <Text style={[styles.echoModalTitle, { color: C.text.primary }]}>Echo with comment</Text>
            <TextInput style={[styles.echoInput, { backgroundColor: C.background, color: C.text.primary, borderColor: C.border }]} placeholder="Add a comment..." placeholderTextColor={C.text.muted} value={echoText} onChangeText={setEchoText} multiline maxLength={280} />
            <View style={styles.echoBtns}>
              <TouchableOpacity onPress={() => setEchoCommentModal(false)}><Text style={{ color: C.text.muted, fontSize: 16 }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={submitEchoComment} style={styles.echoSubmit}><Text style={{ color: '#FFF', fontWeight: '600' }}>Echo</Text></TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'ios' ? 50 : 20, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerLogo: { width: 32, height: 32, borderRadius: 16 },
  tabs: { flexDirection: 'row', flex: 1, justifyContent: 'center', gap: 30 },
  tab: { paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 15, fontWeight: '700' },
  indicator: { height: 4, width: '100%', borderRadius: 2, position: 'absolute', bottom: 0 },
  activeTab: {},
  emptyState: { flex: 1, alignItems: 'center', marginTop: 100 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  echoModal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  echoModalTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
  echoInput: { borderRadius: 12, padding: 12, fontSize: 15, marginBottom: 16, minHeight: 80, textAlignVertical: 'top', borderWidth: 1 },
  echoBtns: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  echoSubmit: { backgroundColor: '#FF6B35', paddingVertical: 10, paddingHorizontal: 24, borderRadius: 20 },
});
