import React, { useEffect, useState, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, Image, KeyboardAvoidingView, Platform, Modal, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTheme } from '../theme/ThemeContext';
import { Colors, LightColors } from '../theme/colors';
import { auth, listenToConvo, addComment, getCurrentUsername, db } from '../services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import YapCard from '../components/YapCard';

function buildTree(comments: any[]) {
  const map: Record<string, any> = {};
  const roots: any[] = [];
  comments.forEach(c => { map[c.id] = { ...c, children: [] }; });
  comments.forEach(c => { if (c.parentCommentId && map[c.parentCommentId]) { map[c.parentCommentId].children.push(map[c.id]); } else { roots.push(map[c.id]); } });
  return roots;
}

function CommentItem({ item, yapId, depth, onReply, onPlay }: { item: any; yapId: string; depth: number; onReply: (c: any) => void; onPlay: (id: string, url: string) => void }) {
  const { isDark } = useTheme();
  const C = isDark ? Colors : LightColors;
  const bars = Array.from({ length: 20 }, (_, i) => 0.2 + Math.sin(i * 1.2) * 0.3 + 0.3);
  return (
    <View style={{ marginLeft: depth * 16, borderLeftWidth: depth > 0 ? 1 : 0, borderLeftColor: 'rgba(255,107,53,0.3)', paddingLeft: depth > 0 ? 12 : 0 }}>
      <View style={[styles.commentItem, { borderBottomColor: C.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {item.avatarUrl ? <Image source={{ uri: item.avatarUrl }} style={styles.cAv} /> : <View style={[styles.cAv, styles.cAvP]}><Text style={styles.cAvT}>{item.username?.charAt(0)?.toUpperCase()}</Text></View>}
          <View style={{ flex: 1 }}>
            <Text style={[styles.cUname, { color: C.text.primary }]}>@{item.username}</Text>
            {item.type === 'text' ? <Text style={{ color: C.text.primary, fontSize: 15, lineHeight: 20, marginTop: 2 }}>{item.content}</Text> :
              <TouchableOpacity onPress={() => onPlay(item.id, item.content)} style={[styles.voiceBubble, { backgroundColor: isDark ? 'rgba(255,107,53,0.15)' : 'rgba(255,107,53,0.1)' }]}>
                <Ionicons name="play" size={16} color="#FF6B35" />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 8 }}>{bars.map((h: number, i: number) => <View key={i} style={{ width: 3, height: h * 18, borderRadius: 1.5, backgroundColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.15)' }} />)}</View>
              </TouchableOpacity>}
            <TouchableOpacity onPress={() => onReply(item)} style={{ marginTop: 6 }}><Text style={{ color: C.text.muted, fontSize: 13 }}>Reply</Text></TouchableOpacity>
          </View>
        </View>
      </View>
      {item.children?.map((child: any) => <CommentItem key={child.id} item={child} yapId={yapId} depth={depth + 1} onReply={onReply} onPlay={onPlay} />)}
    </View>
  );
}

export default function ConvoScreen({ route, navigation }: any) {
  const { yapId, yap } = route.params;
  const { isDark } = useTheme();
  const C = isDark ? Colors : LightColors;
  const [comments, setComments] = useState<any[]>([]);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [replyModalVisible, setReplyModalVisible] = useState(false);
  const [replyTarget, setReplyTarget] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [showVoicePreview, setShowVoicePreview] = useState(false);
  const [voiceUri, setVoiceUri] = useState<string | null>(null);
  const [voiceCaption, setVoiceCaption] = useState('');
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const previewSound = useRef<Audio.Sound | null>(null);

  // Real‑time yap counts
  const [liveYap, setLiveYap] = useState(yap);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'yaps', yapId), (snap) => {
      if (snap.exists()) setLiveYap({ id: snap.id, ...snap.data() });
    });
    return unsub;
  }, [yapId]);

  useEffect(() => { const unsub = listenToConvo(yapId, raw => setComments(raw)); return () => { unsub(); if (sound) sound.unloadAsync(); if (previewSound.current) previewSound.current.unloadAsync(); }; }, [yapId]);

  const playComment = async (id: string, url: string) => {
    if (playingId === id) { if (sound) { const st = await sound.getStatusAsync(); st.isLoaded && st.isPlaying ? await sound.pauseAsync() : await sound?.playAsync(); } return; }
    if (sound) await sound.unloadAsync();
    const { sound: ns } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true }, (st: any) => { if (st.didJustFinish) setPlayingId(null); });
    setSound(ns); setPlayingId(id);
  };

  const openReplyModal = (comment: any) => { setReplyTarget(comment); setReplyText(''); setReplyModalVisible(true); };
  const sendTextReply = async () => { if (!replyText.trim() || !auth.currentUser) return; setSending(true); await addComment(yapId, auth.currentUser.uid, await getCurrentUsername(auth.currentUser.uid), 'text', replyText.trim(), undefined, replyTarget?.id || null); setReplyText(''); setReplyModalVisible(false); setSending(false); };

  async function startVoiceReply() { await Audio.requestPermissionsAsync(); await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true }); const { recording: rec } = await Audio.Recording.createAsync({ ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true }); setRecording(rec); setIsRecording(true); }
  async function stopVoiceReply() { if (!recording) return; await recording.stopAndUnloadAsync(); const uri = recording.getURI(); setRecording(null); setIsRecording(false); if (uri) { setVoiceUri(uri); setShowVoicePreview(true); } await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); }
  async function previewVoice() { if (isPlayingPreview && previewSound.current) { await previewSound.current.pauseAsync(); setIsPlayingPreview(false); return; } if (previewSound.current) await previewSound.current.unloadAsync(); if (!voiceUri) return; const { sound: s } = await Audio.Sound.createAsync({ uri: voiceUri }, { shouldPlay: true }, (st: any) => { if (st.didJustFinish) setIsPlayingPreview(false); }); previewSound.current = s; setIsPlayingPreview(true); }
  async function sendVoiceReply() { if (!voiceUri || !auth.currentUser) return; const fd = new FormData(); fd.append('file', { uri: voiceUri, type: 'audio/m4a', name: 'reply_' + Date.now() + '.m4a' } as any); fd.append('upload_preset', 'yapin_uploads'); fd.append('resource_type', 'video'); const r = await fetch('https://api.cloudinary.com/v1_1/dpbs080al/upload', { method: 'POST', body: fd }); const d = await r.json(); if (d.secure_url) await addComment(yapId, auth.currentUser.uid, await getCurrentUsername(auth.currentUser.uid), 'voice', d.secure_url, 0, replyTarget?.id || null); setShowVoicePreview(false); setVoiceUri(null); setVoiceCaption(''); }

  const tree = buildTree(comments);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: C.background }}>
      <View style={[styles.h, { borderBottomColor: C.border }]}><TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="chevron-back" size={28} color={C.text.primary} /></TouchableOpacity><Text style={[styles.ht, { color: C.text.primary }]}>Convo</Text><View style={{ width: 28 }} /></View>
      <FlatList data={tree} keyExtractor={item => item.id} ListHeaderComponent={<YapCard {...liveYap} yapId={yapId} />} renderItem={({ item }) => <CommentItem item={item} yapId={yapId} depth={0} onReply={openReplyModal} onPlay={playComment} />} contentContainerStyle={{ paddingBottom: 120 }} />
      <View style={[styles.inputBar, { backgroundColor: C.surface, borderTopColor: C.border }]}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: C.background, borderRadius: 25, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' }} onPress={() => openReplyModal(null)}><Text style={{ color: C.text.muted, fontSize: 15 }}>Add a comment...</Text></TouchableOpacity>
        <TouchableOpacity onPressIn={startVoiceReply} onPressOut={stopVoiceReply} style={[styles.micBtn, isRecording && { backgroundColor: '#E0245E' }]}><Ionicons name={isRecording ? 'radio' : 'mic'} size={24} color="#FFF" /></TouchableOpacity>
      </View>
      {/* Glass Reply Modal */}
      <Modal visible={replyModalVisible} transparent animationType="fade" statusBarTranslucent>
        <BlurView intensity={80} tint="dark" style={{ flex: 1 }}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}><View style={{ margin: 20, backgroundColor: 'rgba(20,20,30,0.9)', borderRadius: 24, padding: 24, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}><Text style={{ color: '#FFF', fontSize: 20, fontWeight: '800' }}>{replyTarget ? `Reply to @${replyTarget.username}` : 'Your Reply'}</Text><TouchableOpacity onPress={() => setReplyModalVisible(false)}><Ionicons name="close" size={28} color="#FFF" /></TouchableOpacity></View>
          <TextInput style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, fontSize: 16, color: '#FFF', marginBottom: 20, minHeight: 120, textAlignVertical: 'top', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)' }} placeholder="Type your comment... #hashtags @mentions" placeholderTextColor="rgba(255,255,255,0.5)" value={replyText} onChangeText={setReplyText} multiline maxLength={500} autoFocus />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><TouchableOpacity onPress={() => setReplyModalVisible(false)}><Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '600' }}>Cancel</Text></TouchableOpacity><TouchableOpacity onPress={sendTextReply} disabled={sending || !replyText.trim()} style={{ backgroundColor: '#FF6B35', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 25 }}>{sending ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>Reply</Text>}</TouchableOpacity></View>
        </View></KeyboardAvoidingView></BlurView>
      </Modal>
      {/* Voice Preview Modal */}
      <Modal visible={showVoicePreview} transparent animationType="slide"><TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' }} onPress={() => {}} activeOpacity={1}><View style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 50 }}><Text style={{ color: C.text.primary, fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 20 }}>Preview Voice Reply</Text><TouchableOpacity onPress={previewVoice} style={{ backgroundColor: '#FF6B35', paddingVertical: 14, borderRadius: 25, alignItems: 'center', marginBottom: 16 }}><Text style={{ color: '#FFF', fontWeight: '700' }}>{isPlayingPreview ? 'Pause' : 'Play Preview'}</Text></TouchableOpacity><TextInput style={[styles.ti, { backgroundColor: C.background, color: C.text.primary, width: '100%', marginBottom: 16 }]} placeholder="Add caption... #hashtags @mentions" placeholderTextColor={C.text.muted} value={voiceCaption} onChangeText={setVoiceCaption} multiline maxLength={280} /><View style={{ flexDirection: 'row', gap: 12 }}><TouchableOpacity onPress={() => { setShowVoicePreview(false); setVoiceUri(null); }} style={{ flex: 1, paddingVertical: 14, borderRadius: 25, alignItems: 'center', borderWidth: 1, borderColor: C.border }}><Text style={{ color: C.text.muted, fontWeight: '600' }}>Discard</Text></TouchableOpacity><TouchableOpacity onPress={sendVoiceReply} style={{ flex: 1, paddingVertical: 14, borderRadius: 25, alignItems: 'center', backgroundColor: '#FF6B35' }}><Text style={{ color: '#FFF', fontWeight: '700' }}>Reply</Text></TouchableOpacity></View></View></TouchableOpacity></Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  h: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'ios' ? 60 : 20, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  ht: { fontSize: 18, fontWeight: '800' },
  commentItem: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  cAv: { width: 32, height: 32, borderRadius: 16, marginRight: 10 },
  cAvP: { backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center' },
  cAvT: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  cUname: { fontWeight: '700', fontSize: 14, marginBottom: 2 },
  voiceBubble: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 12, alignSelf: 'flex-start' },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  micBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center' },
  ti: { borderRadius: 20, paddingHorizontal: 15, paddingVertical: 8, maxHeight: 100, fontSize: 15 },
});
