import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated, Modal, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { Colors, LightColors } from '../theme/colors';
import { auth } from '../services/firebase';
import { useProfilePic } from '../theme/ProfilePicContext';
import CaptionText from './CaptionText';

const VERIFIED_USERNAME = 'yapin'; // Official account

export default function YapCard({
  yapId, username, avatarUrl, duration, hashtags, caption,
  echoedUsername, echoMediaUrl, convoCount = 0, echoCount = 0,
  likeCount = 0, isLiked, isPlaying, playbackPosition = 0, userId,
  onPlayPress, onHashtagPress, onEchoPress, onEchoWithComment,
  onConvoPress, onLikePress, onUsernamePress, onAvatarPress, onDeletePress,
  onMentionPress,
}: any) {
  const { isDark } = useTheme();
  const C = isDark ? Colors : LightColors;
  const { recentAvatars } = useProfilePic();
  const displayAvatarUrl = (userId && recentAvatars[userId]) ? recentAvatars[userId] : avatarUrl;
  const pulse = useRef(new Animated.Value(1)).current;
  const [showEcho, setShowEcho] = useState(false);
  const isOwn = userId === auth.currentUser?.uid;
  const verified = username?.toLowerCase() === VERIFIED_USERNAME;

  useEffect(() => { if (isPlaying) { Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1.15, duration: 600, useNativeDriver: true }), Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true })])).start(); } else pulse.setValue(1); }, [isPlaying]);

  const ts = Math.floor(duration / 1000); const fmt = Math.floor(ts / 60) + ':' + (ts % 60).toString().padStart(2, '0');
  const bars = Array.from({ length: 30 }, (_, i) => 0.2 + (Math.sin(i * 1.5) * 0.3) + 0.3);

  return (
    <View style={[s.card, { borderBottomColor: C.border }]}>
      {echoedUsername && (
        <View style={s.echoBar}>
          <Ionicons name="pulse-outline" size={14} color={C.text.muted} />
          <Text style={[s.echoTxt, { color: C.text.muted }]}>{echoedUsername} echoed</Text>
        </View>
      )}

      <View style={s.body}>
        <TouchableOpacity onPress={onAvatarPress} activeOpacity={0.9} style={s.avCol}>
          {displayAvatarUrl ? <Image source={{ uri: displayAvatarUrl }} style={s.av} /> : <View style={[s.av, s.avP]}><Text style={s.avT}>{username?.charAt(0)?.toUpperCase() || '?'}</Text></View>}
        </TouchableOpacity>
        <View style={s.content}>
          <View style={s.nameRow}>
            <TouchableOpacity onPress={onUsernamePress} style={s.nameTouch}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[s.name, { color: C.text.primary }]} numberOfLines={1}>@{username}</Text>
                {verified && (
                  <Ionicons name="shield-checkmark" size={16} color="#FF6B35" style={{ marginLeft: 4 }} />
                )}
              </View>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => Share.share({ message: 'Check out @' + username + ' on Yapin!' })}><Ionicons name="radio-outline" size={16} color={C.text.muted} /></TouchableOpacity>
              {isOwn && onDeletePress && <TouchableOpacity onPress={onDeletePress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="ellipsis-horizontal" size={18} color={C.text.muted} /></TouchableOpacity>}
            </View>
          </View>

          {caption ? (
            <CaptionText
              text={caption}
              onHashtagPress={onHashtagPress}
              onMentionPress={onMentionPress}
            />
          ) : null}
          {echoMediaUrl ? <Image source={{ uri: echoMediaUrl }} style={s.echoImg} /> : null}

          <TouchableOpacity style={[s.player, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]} onPress={onPlayPress} activeOpacity={0.8}>
            <Animated.View style={[s.play, { transform: [{ scale: pulse }] }]}><Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color="#FFF" /></Animated.View>
            <View style={s.wf}>{bars.map((h: number, i: number) => <View key={i} style={[s.wb, { height: h * 24, backgroundColor: (i / 30) <= playbackPosition ? C.accent : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)') }]} />)}</View>
            <Text style={[s.dur, { color: C.text.muted }]}>{fmt}</Text>
          </TouchableOpacity>

          {hashtags?.length > 0 && (
            <View style={s.tags}>
              {hashtags.map((t: string) => (
                <TouchableOpacity key={t} onPress={() => onHashtagPress?.(t)}><Text style={s.tag}>{t}</Text></TouchableOpacity>
              ))}
            </View>
          )}

          <View style={s.acts}>
            <TouchableOpacity style={s.act} onPress={onConvoPress}><Ionicons name="mic-circle-outline" size={18} color={C.text.muted} /><Text style={[s.actT, { color: C.text.muted }]}>{convoCount || ''}</Text></TouchableOpacity>
            <TouchableOpacity style={s.act} onPress={() => setShowEcho(true)}><Ionicons name="pulse-outline" size={20} color={echoCount > 0 ? '#FF6B35' : C.text.muted} /><Text style={[s.actT, { color: echoCount > 0 ? '#FF6B35' : C.text.muted }]}>{echoCount || ''}</Text></TouchableOpacity>
            <TouchableOpacity style={s.act} onPress={onLikePress}><Ionicons name={isLiked ? 'sparkles' : 'sparkles-outline'} size={19} color={isLiked ? '#FF6B35' : C.text.muted} /><Text style={[s.actT, { color: isLiked ? '#FF6B35' : C.text.muted }]}>{likeCount || ''}</Text></TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Glass Echo Modal */}
      <Modal visible={showEcho} transparent animationType="fade" statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
          <TouchableOpacity style={{ position: 'absolute', top: 60, right: 20, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }} onPress={() => setShowEcho(false)}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={{ width: '100%', alignItems: 'center', paddingVertical: 24 }} onPress={() => { setShowEcho(false); onEchoPress?.(); }}>
            <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,179,71,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="pulse-outline" size={36} color="#FFB347" />
            </View>
            <Text style={{ color: '#FFF', fontSize: 20, fontWeight: '800', marginBottom: 4 }}>Echo</Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Share this Yap instantly</Text>
          </TouchableOpacity>
          <View style={{ width: '80%', height: 0.5, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 8 }} />
          <TouchableOpacity style={{ width: '100%', alignItems: 'center', paddingVertical: 24 }} onPress={() => { setShowEcho(false); onEchoWithComment?.(); }}>
            <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,107,53,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Ionicons name="pulse" size={36} color="#FF6B35" />
            </View>
            <Text style={{ color: '#FFF', fontSize: 20, fontWeight: '800', marginBottom: 4 }}>Echo with comment</Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Add your voice to this Yap</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowEcho(false)} style={{ marginTop: 16, paddingVertical: 12 }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  echoBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 52, marginBottom: 4 },
  echoTxt: { fontSize: 13, fontWeight: '600' },
  body: { flexDirection: 'row', paddingHorizontal: 12 },
  avCol: { marginRight: 12 },
  av: { width: 48, height: 48, borderRadius: 24 },
  avP: { backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center' },
  avT: { color: '#FFF', fontWeight: 'bold', fontSize: 18 },
  content: { flex: 1 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  nameTouch: { flex: 1 },
  name: { fontWeight: '800', fontSize: 16 },
  echoImg: { width: '100%', height: 200, borderRadius: 16, marginBottom: 10 },
  player: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 20, marginBottom: 10 },
  play: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center' },
  wf: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, marginHorizontal: 12 },
  wb: { width: 3, borderRadius: 1.5 },
  dur: { fontSize: 12, fontWeight: 'bold' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  tag: { color: '#FFB347', fontSize: 14, fontWeight: '600' },
  acts: { flexDirection: 'row', justifyContent: 'space-between', paddingRight: 20, marginTop: 4 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 50 },
  actT: { fontSize: 13 },
});
