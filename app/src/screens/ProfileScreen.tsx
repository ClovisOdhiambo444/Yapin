import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, Image, FlatList, Modal, RefreshControl, Platform, Linking, Animated, ActivityIndicator, ScrollView, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { useTheme } from '../theme/ThemeContext';
import { Colors, LightColors } from '../theme/colors';
import { Spacing } from '../theme/spacing';
import { auth, logout, getUserProfile, updateProfile, isLiked, likeYap, unlikeYap, echoYap, getCurrentUsername, db, followUser, unfollowUser, isFollowing, findUserByUsername } from '../services/firebase';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot, orderBy, limit } from 'firebase/firestore';
import YapCard from '../components/YapCard';
import { useProfilePic } from '../theme/ProfilePicContext';

const SOCIAL_PLATFORMS = [
  { key: 'instagram', icon: 'logo-instagram', color: '#E4405F' }, { key: 'twitter', icon: 'logo-twitter', color: '#1DA1F2' },
  { key: 'tiktok', icon: 'logo-tiktok', color: '#FFFFFF' }, { key: 'snapchat', icon: 'logo-snapchat', color: '#FFFC00' },
  { key: 'reddit', icon: 'logo-reddit', color: '#FF4500' }, { key: 'linkedin', icon: 'logo-linkedin', color: '#0A66C2' },
  { key: 'facebook', icon: 'logo-facebook', color: '#1877F2' },
];

export default function ProfileScreen({ navigation }: any) {
  const { isDark } = useTheme();
  const C = isDark ? Colors : LightColors;
  const [profile, setProfile] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(''); const [socials, setSocials] = useState<Record<string,string>>({});
  const [yaps, setYaps] = useState<any[]>([]);
  const [echoes, setEchoes] = useState<any[]>([]);
  const [likedYaps, setLikedYaps] = useState<Set<string>>(new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [activeTab, setActiveTab] = useState<'yaps'|'echoes'>('yaps');
  const [refreshing, setRefreshing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [modalType, setModalType] = useState<'followers'|'following'|null>(null);
  const [userList, setUserList] = useState<any[]>([]);
  const user = auth.currentUser;
  const { updateAvatar } = useProfilePic();

  const sound = useRef<Audio.Sound | null>(null);
  const posInterval = useRef<NodeJS.Timeout | null>(null);
  const originalListeners = useRef<Map<string, () => void>>(new Map());

  const [followerCount, setFollowerCount] = useState<number|null>(null);
  const [followingCount, setFollowingCount] = useState<number|null>(null);

  useEffect(() => { if (!user) return; const unsubF = onSnapshot(collection(db, 'users', user.uid, 'followers'), s => setFollowerCount(s.size)); const unsubG = onSnapshot(collection(db, 'users', user.uid, 'following'), s => setFollowingCount(s.size)); return () => { unsubF(); unsubG(); }; }, [user]);
  useEffect(() => { if (!user) return; loadProfile(); const qYaps = query(collection(db, 'yaps'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'), limit(50)); const unsubYaps = onSnapshot(qYaps, async snap => { const all = snap.docs.map(d => ({ id: d.id, ...d.data() })); setYaps(all.filter((y: any) => !y.echoedYapId)); setEchoes(all.filter((y: any) => y.echoedYapId)); for (const y of all) if (await isLiked(y.echoedYapId || y.id, user.uid)) setLikedYaps(p => new Set(p).add(y.id)); }); return unsubYaps; }, [user]);

  // Sync original counts for echoes
  useEffect(() => {
    yaps.forEach((yap) => {
      if (yap.echoedYapId && !originalListeners.current.has(yap.id)) {
        const unsub = onSnapshot(doc(db, "yaps", yap.echoedYapId), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setYaps(prev => prev.map(y => y.id === yap.id ? { ...y, likeCount: data.likeCount || 0, echoCount: data.echoCount || 0, convoCount: data.convoCount || 0 } : y));
            setEchoes(prev => prev.map(y => y.id === yap.id ? { ...y, likeCount: data.likeCount || 0, echoCount: data.echoCount || 0, convoCount: data.convoCount || 0 } : y));
          }
        });
        originalListeners.current.set(yap.id, unsub);
      }
    });
    return () => { originalListeners.current.forEach(u => u()); originalListeners.current.clear(); };
  }, [yaps]);

  useEffect(() => {
    return () => {
      if (sound.current) { sound.current.unloadAsync(); }
      if (posInterval.current) clearInterval(posInterval.current);
    };
  }, []);

  useEffect(() => {
    if (sound.current && playingId) {
      posInterval.current = setInterval(async () => {
        const st = await sound.current.getStatusAsync();
        if (st.isLoaded && st.durationMillis) setPlaybackPosition(st.positionMillis / st.durationMillis);
      }, 100);
    } else {
      if (posInterval.current) clearInterval(posInterval.current);
      setPlaybackPosition(0);
    }
    return () => { if (posInterval.current) clearInterval(posInterval.current); };
  }, [sound.current, playingId]);

  const cleanupAudio = async () => {
    if (sound.current) { await sound.current.unloadAsync(); sound.current = null; }
    if (posInterval.current) clearInterval(posInterval.current);
    setPlayingId(null);
  };

  const playYap = async (id: string, url: string) => {
    if (playingId === id) {
      if (sound.current) {
        const st = await sound.current.getStatusAsync();
        if (st.isLoaded) {
          st.isPlaying ? await sound.current.pauseAsync() : await sound.current.playAsync();
        }
      }
      return;
    }
    await cleanupAudio();
    const { sound: ns } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true }, (st: any) => { if (st.didJustFinish) cleanupAudio(); });
    sound.current = ns;
    setPlayingId(id);
  };

  const handleLike = async (yap: any) => {
    if (!user) return;
    const targetId = yap.echoedYapId || yap.id;
    if (likedYaps.has(yap.id)) {
      await unlikeYap(targetId, user.uid);
      setLikedYaps(p => { const n = new Set(p); n.delete(yap.id); return n; });
    } else {
      await likeYap(targetId, user.uid);
      setLikedYaps(p => new Set(p).add(yap.id));
    }
  };

  const handleEcho = async (yap: any) => { if (!user) return; await echoYap(user.uid, await getCurrentUsername(user.uid), yap.id, ''); };

  async function loadProfile() { if (!user) return; const d = await getUserProfile(user.uid); setProfile(d); setBio(d?.bio || ''); setSocials(d?.socials || {}); }
  async function loadUserList(type: 'followers'|'following') { if (!user) return; const snap = await getDocs(collection(db, 'users', user.uid, type)); const list = await Promise.all(snap.docs.map(async d => { const u = await getDoc(doc(db, 'users', d.id)); const following = user ? await isFollowing(user.uid, d.id) : false; return { id: d.id, ...u.data(), isFollowing: following }; })); setUserList(list); setModalType(type); }

  async function pickAvatar() { const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1,1], quality: 0.8 }); if (!r.canceled && user) { const uri = r.assets[0].uri; const fd = new FormData(); fd.append('file', { uri, type: 'image/jpeg', name: 'avatar.jpg' } as any); fd.append('upload_preset', 'yapin_uploads'); const res = await fetch('https://api.cloudinary.com/v1_1/dpbs080al/upload', { method: 'POST', body: fd }); const d = await res.json(); if (d.secure_url) { setProfile((p: any) => ({ ...p, avatarUrl: d.secure_url })); updateAvatar(user.uid, d.secure_url); await updateProfile(user.uid, { avatarUrl: d.secure_url }); } } }
  async function saveProfile() { if (!user) return; await updateProfile(user.uid, { bio, socials }); setEditing(false); loadProfile(); }

  const openLink = (url: string) => { const full = url.startsWith('http') ? url : 'https://' + url; Linking.openURL(full).catch(() => {}); };
  const handleLogout = () => { Alert.alert('Logout', 'Are you sure?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Logout', style: 'destructive', onPress: () => logout() }]); };

  return (
    <View style={[styles.container, { backgroundColor: '#08090A' }]}>
      <FlatList
        data={activeTab === 'yaps' ? yaps : echoes} keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadProfile} tintColor="#FF6B35" />}
        ListHeaderComponent={<View>
          <View style={styles.navBar}>
            <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="chevron-back" size={28} color="#FFF" /></TouchableOpacity>
            <Text style={styles.navTitle}>Profile</Text>
            <TouchableOpacity onPress={handleLogout}><Ionicons name="log-out-outline" size={26} color="#FF4B4B" /></TouchableOpacity>
          </View>
          <View style={styles.profileCard}>
            <TouchableOpacity onPress={() => setShowEditModal(true)}><View style={{ position: 'relative' }}>{profile?.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} /> : <LinearGradient colors={['#FF6B35', '#FFB347']} style={styles.avatar}><Text style={styles.avatarText}>{profile?.username?.charAt(0)?.toUpperCase() || '?'}</Text></LinearGradient>}<View style={styles.cameraBadge}><Ionicons name="camera" size={14} color="#FFF" /></View></View></TouchableOpacity>
            <Text style={styles.displayName}>{profile?.username || 'Username'}</Text><Text style={styles.handle}>@{profile?.username?.toLowerCase()}</Text>
            {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
            {profile?.socials && Object.values(profile.socials).some(v => v) && <View style={styles.socialIconsRow}>{SOCIAL_PLATFORMS.map(p => { const link = profile.socials?.[p.key]; if (!link) return null; return <TouchableOpacity key={p.key} onPress={() => openLink(link)} style={{ padding: 6 }}><Ionicons name={p.icon as any} size={24} color={p.color} /></TouchableOpacity>; })}</View>}
            <View style={styles.countsRow}><View style={styles.countItem}><Text style={styles.countNum}>{yaps.length + echoes.length}</Text><Text style={styles.countLabel}>Yaps</Text></View><View style={styles.countDivider} /><TouchableOpacity style={styles.countItem} onPress={() => loadUserList('following')}><Text style={styles.countNum}>{followingCount ?? '…'}</Text><Text style={styles.countLabel}>Following</Text></TouchableOpacity><View style={styles.countDivider} /><TouchableOpacity style={styles.countItem} onPress={() => loadUserList('followers')}><Text style={styles.countNum}>{followerCount ?? '…'}</Text><Text style={styles.countLabel}>Followers</Text></TouchableOpacity></View>
          </View>
          <View style={styles.tabRow}><TouchableOpacity style={[styles.tab, activeTab==='yaps'&&styles.tabActive]} onPress={()=>setActiveTab('yaps')}><Text style={[styles.tabText, activeTab==='yaps'&&styles.tabTextActive]}>Yaps</Text></TouchableOpacity><TouchableOpacity style={[styles.tab, activeTab==='echoes'&&styles.tabActive]} onPress={()=>setActiveTab('echoes')}><Text style={[styles.tabText, activeTab==='echoes'&&styles.tabTextActive]}>Echoes</Text></TouchableOpacity></View>
        </View>}
        renderItem={({ item }) => (
          <YapCard
            yapId={item.id} username={item.username} avatarUrl={item.avatarUrl}
            duration={item.duration} hashtags={item.hashtags||[]} caption={item.caption}
            echoedUsername={item.echoedUsername}
            convoCount={item.echoedYapId ? item.convoCount : item.convoCount || 0}
            echoCount={item.echoedYapId ? item.echoCount : item.echoCount || 0}
            likeCount={item.echoedYapId ? item.likeCount : item.likeCount || 0}
            isLiked={likedYaps.has(item.id)}
            isPlaying={playingId === item.id}
            playbackPosition={playingId === item.id ? playbackPosition : 0}
            userId={item.userId}
            onPlayPress={() => playYap(item.id, item.audioUrl)}
            onHashtagPress={(tag:string) => navigation.navigate('Hashtag',{hashtag:tag})}
            onEchoPress={() => handleEcho(item)}
            onEchoWithComment={() => {}}
            onConvoPress={() => navigation.navigate('Convo',{yapId:item.id,yap:item})}
            onLikePress={() => handleLike(item)}
            onUsernamePress={() => {}}
            onAvatarPress={() => {}}
            onDeletePress={() => {}}
            onMentionPress={async (uname: string) => {
              const userDoc = await findUserByUsername(uname);
              if (userDoc) navigation.navigate('UserProfile', { userId: userDoc.id });
            }}
          />
        )}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {/* Followers/Following Modal */}
      <Modal visible={!!modalType} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setModalType(null)} activeOpacity={1}>
          <View style={styles.modalContent}><View style={styles.modalHandle} /><Text style={styles.modalTitle}>{modalType==='followers'?'Followers':'Following'}</Text>
            <FlatList data={userList} keyExtractor={item => item.id} renderItem={({ item }) => (
              <TouchableOpacity style={styles.userRow} onPress={() => { setModalType(null); navigation.navigate('UserProfile', { userId: item.id }); }}>
                {item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={styles.userAv} /> : <View style={[styles.userAv, { backgroundColor: '#FF6B35', justifyContent: 'center', alignItems: 'center' }]}><Text style={{ color: '#FFF', fontWeight: '700' }}>{item.username?.charAt(0)?.toUpperCase()}</Text></View>}
                <View style={{ flex: 1 }}><Text style={{ color: '#FFF', fontWeight: '600' }}>@{item.username}</Text><Text style={{ color: '#999', fontSize: 13 }} numberOfLines={1}>{item.bio || ''}</Text></View>
                {item.id !== user?.uid && (
                  <TouchableOpacity onPress={async () => { if (item.isFollowing) { await unfollowUser(user!.uid, item.id); setUserList(prev => prev.map(u => u.id === item.id ? { ...u, isFollowing: false } : u)); } else { await followUser(user!.uid, item.id); setUserList(prev => prev.map(u => u.id === item.id ? { ...u, isFollowing: true } : u)); } }} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: item.isFollowing ? 'transparent' : '#FF6B35', borderWidth: 1, borderColor: item.isFollowing ? C.border : '#FF6B35' }}>
                    <Text style={{ color: item.isFollowing ? C.text.primary : '#FFF', fontWeight: '700', fontSize: 13 }}>{item.isFollowing ? 'Following' : 'Follow'}</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            )} />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Profile Modal */}
      <EditProfileModal visible={showEditModal} onClose={() => setShowEditModal(false)} profile={profile} onSaved={loadProfile} />
    </View>
  );
}

function EditProfileModal({ visible, onClose, profile, onSaved }: any) {
  const { isDark } = useTheme(); const C = isDark ? Colors : LightColors;
  const [bio, setBio] = useState(profile?.bio || ''); const [socials, setSocials] = useState<Record<string,string>>(profile?.socials || {});
  const [saving, setSaving] = useState(false); const user = auth.currentUser; const { updateAvatar } = useProfilePic();
  useEffect(() => { setBio(profile?.bio || ''); setSocials(profile?.socials || {}); }, [profile]);
  async function pickAvatar() { const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1,1], quality: 0.8 }); if (!r.canceled && user) { const uri = r.assets[0].uri; const fd = new FormData(); fd.append('file', { uri, type: 'image/jpeg', name: 'avatar.jpg' } as any); fd.append('upload_preset', 'yapin_uploads'); const res = await fetch('https://api.cloudinary.com/v1_1/dpbs080al/upload', { method: 'POST', body: fd }); const d = await res.json(); if (d.secure_url) { updateAvatar(user.uid, d.secure_url); await updateProfile(user.uid, { avatarUrl: d.secure_url }); onSaved(); } } }
  async function handleSave() { if (!user) return; setSaving(true); await updateProfile(user.uid, { bio, socials }); setSaving(false); onSaved(); onClose(); }
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.85)', justifyContent:'center', alignItems:'center', padding:20 }}>
        <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={{ width:'100%', alignItems:'center' }}>
          <ScrollView style={{ width:'100%', maxHeight:'90%' }} contentContainerStyle={{ alignItems:'center' }}>
            <View style={{ width:'90%', backgroundColor:'rgba(20,20,30,0.95)', borderRadius:24, padding:24, borderWidth:0.5, borderColor:'rgba(255,255,255,0.1)' }}>
              <TouchableOpacity style={{ position:'absolute', top:16, right:16, zIndex:10 }} onPress={onClose}><Ionicons name="close" size={28} color="#FFF" /></TouchableOpacity>
              <Text style={{ color:'#FFF', fontSize:20, fontWeight:'800', textAlign:'center', marginBottom:24 }}>Edit Profile</Text>
              <TouchableOpacity onPress={pickAvatar} style={{ alignSelf:'center', marginBottom:20 }}>{profile?.avatarUrl ? <Image source={{ uri: profile.avatarUrl }} style={{ width:90, height:90, borderRadius:45, borderWidth:3, borderColor:'#FF6B35' }} /> : <LinearGradient colors={['#FF6B35','#FFB347']} style={{ width:90, height:90, borderRadius:45, alignItems:'center', justifyContent:'center' }}><Text style={{ color:'#FFF', fontSize:36, fontWeight:'900' }}>{profile?.username?.charAt(0)?.toUpperCase()}</Text></LinearGradient>}<View style={{ position:'absolute', bottom:0, right:0, backgroundColor:'#FF6B35', width:28, height:28, borderRadius:14, alignItems:'center', justifyContent:'center', borderWidth:2, borderColor:'#000' }}><Ionicons name="camera" size={14} color="#FFF" /></View></TouchableOpacity>
              <TextInput style={[styles.editInput, { color:'#FFF', backgroundColor:'rgba(255,255,255,0.05)', borderColor:'rgba(255,255,255,0.15)' }]} placeholder="Bio" placeholderTextColor="rgba(255,255,255,0.4)" value={bio} onChangeText={setBio} multiline maxLength={160} />
              <Text style={{ color:'rgba(255,255,255,0.6)', fontSize:13, fontWeight:'600', marginTop:16, marginBottom:8 }}>Social Links</Text>
              {SOCIAL_PLATFORMS.map(p => <View key={p.key} style={[styles.socialInputRow, { backgroundColor:'rgba(255,255,255,0.03)', borderColor:'rgba(255,255,255,0.1)' }]}><Ionicons name={p.icon as any} size={20} color={p.color} /><TextInput style={{ flex:1, color:'#FFF', fontSize:14, paddingVertical:8 }} placeholder={p.label} placeholderTextColor="rgba(255,255,255,0.3)" value={socials[p.key]||''} onChangeText={t => setSocials(s => ({...s, [p.key]: t}))} autoCapitalize="none" /></View>)}
              <TouchableOpacity onPress={handleSave} disabled={saving} style={{ marginTop:24, backgroundColor:'#FF6B35', borderRadius:25, paddingVertical:14, alignItems:'center' }}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={{ color:'#FFF', fontWeight:'800', fontSize:16 }}>Save</Text>}</TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS==='ios'?60:20, paddingHorizontal:16, paddingBottom:12, borderBottomWidth:StyleSheet.hairlineWidth, borderBottomColor:'rgba(255,255,255,0.1)' },
  navTitle: { fontSize:18, fontWeight:'800', color:'#FFF' },
  profileCard: { paddingHorizontal:20, paddingBottom:20, alignItems:'center' },
  avatar: { width:100, height:100, borderRadius:50, borderWidth:3, borderColor:'#FF6B35', alignItems:'center', justifyContent:'center' },
  avatarText: { color:'#FFF', fontSize:40, fontWeight:'900' },
  cameraBadge: { position:'absolute', bottom:2, right:2, width:28, height:28, borderRadius:14, backgroundColor:'#FF6B35', alignItems:'center', justifyContent:'center', borderWidth:2, borderColor:'#08090A' },
  displayName: { fontSize:24, fontWeight:'900', color:'#FFF', marginTop:8 },
  handle: { fontSize:15, color:'rgba(255,255,255,0.5)', marginBottom:4 },
  bio: { fontSize:15, color:'rgba(255,255,255,0.7)', textAlign:'center', marginBottom:12, paddingHorizontal:16 },
  socialIconsRow: { flexDirection:'row', gap:12, marginBottom:16, justifyContent:'center' },
  countsRow: { flexDirection:'row', alignItems:'center', marginBottom:8 },
  countItem: { alignItems:'center', paddingHorizontal:16 },
  countNum: { color:'#FFF', fontWeight:'800', fontSize:18 },
  countLabel: { color:'rgba(255,255,255,0.5)', fontSize:13, marginTop:2 },
  countDivider: { width:0.5, height:24, backgroundColor:'rgba(255,255,255,0.15)' },
  tabRow: { flexDirection:'row', borderBottomWidth:0.5, borderBottomColor:'rgba(255,255,255,0.1)' },
  tab: { flex:1, paddingVertical:12, alignItems:'center' },
  tabActive: { borderBottomWidth:3, borderBottomColor:'#FF6B35' },
  tabText: { color:'rgba(255,255,255,0.5)', fontWeight:'600', fontSize:15 },
  tabTextActive: { color:'#FFF', fontWeight:'700' },
  editInput: { borderRadius:14, padding:14, fontSize:15, marginBottom:12, borderWidth:0.5 },
  socialInputRow: { flexDirection:'row', alignItems:'center', gap:10, borderRadius:10, paddingHorizontal:12, marginBottom:8, borderWidth:0.5 },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.8)', justifyContent:'flex-end' },
  modalContent: { backgroundColor:'#121826', borderTopLeftRadius:25, borderTopRightRadius:25, height:'70%', padding:20 },
  modalHandle: { width:40, height:5, backgroundColor:'#333', borderRadius:3, alignSelf:'center', marginBottom:15 },
  modalTitle: { fontSize:20, fontWeight:'800', color:'#FFF', textAlign:'center', marginBottom:20 },
  userRow: { flexDirection:'row', alignItems:'center', paddingVertical:12, gap:12 },
  userAv: { width:40, height:40, borderRadius:20 },
});
