import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated, Modal, Share, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { Colors, LightColors } from '../theme/colors';
import { auth } from '../services/firebase';

const REACTIONS = ['❤️', '😂', '🔥', '😮', '😢', '👏', '🎉', '💯'];

interface YapCardProps {
  yapId: string;
  username: string;
  avatarUrl?: string | null;
  duration: number;
  hashtags: string[];
  caption?: string;
  echoedUsername?: string;
  echoMediaUrl?: string;
  convoCount?: number;
  echoCount?: number;
  likeCount?: number;
  reactionCount?: number;
  isLiked?: boolean;
  isPlaying?: boolean;
  playbackPosition?: number;
  userId?: string;
  onPlayPress?: () => void;
  onHashtagPress?: (tag: string) => void;
  onEchoPress?: () => void;
  onEchoWithComment?: () => void;
  onConvoPress?: () => void;
  onLikePress?: () => void;
  onUsernamePress?: () => void;
  onAvatarPress?: () => void;
  onReaction?: (r: string) => void;
  onDeletePress?: () => void;
}

export default function YapCard({
  yapId, username, avatarUrl, duration, hashtags, caption,
  echoedUsername, echoMediaUrl, convoCount = 0, echoCount = 0,
  likeCount = 0, reactionCount = 0, isLiked, isPlaying,
  playbackPosition = 0, userId,
  onPlayPress, onHashtagPress, onEchoPress, onEchoWithComment,
  onConvoPress, onLikePress, onUsernamePress, onAvatarPress,
  onReaction, onDeletePress,
}: YapCardProps) {
  const { isDark } = useTheme();
  const C = isDark ? Colors : LightColors;
  const pulse = useRef(new Animated.Value(1)).current;
  const [showRx, setShowRx] = useState(false);
  const [showEcho, setShowEcho] = useState(false);
  const isOwn = userId === auth.currentUser?.uid;

  useEffect(() => {
    if (isPlaying) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])).start();
    } else pulse.setValue(1);
  }, [isPlaying]);

  const ts = Math.floor(duration / 1000);
  const fmt = Math.floor(ts / 60) + ':' + (ts % 60).toString().padStart(2, '0');
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
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={s.av} />
          ) : (
            <View style={[s.av, s.avP]}>
              <Text style={s.avT}>{username?.charAt(0)?.toUpperCase() || '?'}</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={s.content}>
          <View style={s.nameRow}>
            <TouchableOpacity onPress={onUsernamePress} style={s.nameTouch}>
              <Text style={[s.name, { color: C.text.primary }]} numberOfLines={1}>@{username}</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} onPress={() => Share.share({ message: 'Check out @' + username + ' on Yapin!' })}>
                <Ionicons name="radio-outline" size={16} color={C.text.muted} />
              </TouchableOpacity>
              {isOwn && onDeletePress && (
                <TouchableOpacity onPress={onDeletePress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="ellipsis-horizontal" size={18} color={C.text.muted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {caption ? <Text style={[s.cap, { color: C.text.secondary }]}>{caption}</Text> : null}
          {echoMediaUrl ? <Image source={{ uri: echoMediaUrl }} style={s.echoImg} /> : null}

          <TouchableOpacity style={[s.player, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }]} onPress={onPlayPress} activeOpacity={0.8}>
            <Animated.View style={[s.play, { transform: [{ scale: pulse }] }]}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color="#FFF" />
            </Animated.View>
            <View style={s.wf}>
              {bars.map((h, i) => (
                <View key={i} style={[s.wb, { height: h * 24, backgroundColor: (i / 30) <= playbackPosition ? C.accent : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)') }]} />
              ))}
            </View>
            <Text style={[s.dur, { color: C.text.muted }]}>{fmt}</Text>
          </TouchableOpacity>

          {hashtags?.length > 0 && (
            <View style={s.tags}>
              {hashtags.map((t: string) => (
                <TouchableOpacity key={t} onPress={() => onHashtagPress?.(t)}>
                  <Text style={s.tag}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={s.acts}>
            <TouchableOpacity style={s.act} onPress={onConvoPress}>
              <Ionicons name="mic-circle-outline" size={18} color={C.text.muted} />
              <Text style={[s.actT, { color: C.text.muted }]}>{convoCount || ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.act} onPress={() => setShowEcho(true)}>
              <Ionicons name="pulse-outline" size={20} color={echoCount > 0 ? C.echo : C.text.muted} />
              <Text style={[s.actT, { color: echoCount > 0 ? C.echo : C.text.muted }]}>{echoCount || ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.act} onPress={onLikePress}>
              <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={19} color={isLiked ? C.like : C.text.muted} />
              <Text style={[s.actT, { color: isLiked ? C.like : C.text.muted }]}>{likeCount || ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.act} onPress={() => setShowRx(true)}>
              <Ionicons name={reactionCount > 0 ? 'happy' : 'happy-outline'} size={19} color={reactionCount > 0 ? '#FF6B35' : C.text.muted} />
              <Text style={[s.actT, { color: reactionCount > 0 ? '#FF6B35' : C.text.muted }]}>{reactionCount || ''}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal visible={showRx} transparent animationType="slide">
        <TouchableOpacity style={s.modalOverlay} onPress={() => setShowRx(false)} activeOpacity={1}>
          <View style={[s.modalContent, { backgroundColor: C.surface }]}>
            <Text style={[s.modalTitle, { color: C.text.primary }]}>Add Reaction</Text>
            <View style={s.reactionGrid}>
              {REACTIONS.map(e => (
                <TouchableOpacity key={e} style={s.reactionItem} onPress={() => { onReaction?.(e); setShowRx(false); }}>
                  <Text style={s.emojiText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showEcho} transparent animationType="slide">
        <TouchableOpacity style={s.modalOverlay} onPress={() => setShowEcho(false)} activeOpacity={1}>
          <View style={[s.modalContent, { backgroundColor: C.surface }]}>
            <TouchableOpacity style={[s.echoOption, { borderBottomColor: C.border }]} onPress={() => { setShowEcho(false); onEchoPress?.(); }}>
              <Ionicons name="pulse-outline" size={22} color={C.text.primary} />
              <Text style={[s.echoOptionText, { color: C.text.primary }]}>Echo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.echoOption} onPress={() => { setShowEcho(false); onEchoWithComment?.(); }}>
              <Ionicons name="create-outline" size={22} color={C.text.primary} />
              <Text style={[s.echoOptionText, { color: C.text.primary }]}>Echo with comment</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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
  cap: { fontSize: 15, lineHeight: 20, marginBottom: 8 },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  reactionGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 10 },
  reactionItem: { padding: 10 },
  emojiText: { fontSize: 30 },
  echoOption: { flexDirection: 'row', alignItems: 'center', gap: 15, paddingVertical: 18 },
  echoOptionText: { fontSize: 17, fontWeight: '600' },
});
