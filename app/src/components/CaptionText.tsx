import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme/colors';

interface CaptionTextProps {
  text: string;
  onHashtagPress?: (tag: string) => void;
  onMentionPress?: (username: string) => void;
}

export default function CaptionText({ text, onHashtagPress, onMentionPress }: CaptionTextProps) {
  if (!text) return null;

  // Split on hashtags and mentions while keeping them in the output
  const parts = text.split(/(#\w+|@\w+)/g);

  return (
    <Text style={styles.baseText}>
      {parts.map((part, index) => {
        if (part.startsWith('#')) {
          return (
            <Text
              key={index}
              style={styles.hashtag}
              onPress={() => onHashtagPress?.(part)}
            >
              {part}
            </Text>
          );
        }
        if (part.startsWith('@')) {
          const username = part.substring(1);
          return (
            <Text
              key={index}
              style={styles.mention}
              onPress={() => onMentionPress?.(username)}
            >
              {part}
            </Text>
          );
        }
        return <Text key={index}>{part}</Text>;
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  baseText: {
    color: Colors.text.secondary,
    fontSize: 15,
    lineHeight: 20,
  },
  hashtag: {
    color: '#FFB347',
    fontWeight: '600',
  },
  mention: {
    color: '#FF6B35',
    fontWeight: '700',
  },
});
