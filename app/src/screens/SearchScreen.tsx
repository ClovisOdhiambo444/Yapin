import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { Colors, LightColors } from "../theme/colors";
import { BorderRadius, Spacing } from "../theme/spacing";
import { db } from "../services/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
} from "firebase/firestore";

export default function SearchScreen({ navigation }: any) {
  const { isDark } = useTheme();
  const C = isDark ? Colors : LightColors;

  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchType, setSearchType] = useState<"hashtags" | "users">(
    "hashtags",
  );

  // Debounced search logic
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchText.length > 1) {
        handleSearch();
      } else {
        setResults([]);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchText, searchType]);

  const handleSearch = async () => {
    const term = searchText.trim().toLowerCase();
    if (!term) return;

    setLoading(true);
    try {
      if (searchType === "hashtags") {
        // For hashtags, we navigate away, but we could also show "Trending" here
        // If the user hits enter, we perform the navigation
      } else {
        const uname = term.startsWith("@") ? term.substring(1) : term;
        const q = query(
          collection(db, "users"),
          where("username", ">=", uname),
          where("username", "<=", uname + "\uf8ff"),
          limit(15),
        );
        const snap = await getDocs(q);
        setResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const renderUserItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.userItem, { borderBottomColor: C.border }]}
      onPress={() => navigation.navigate("UserProfile", { userId: item.id })}
    >
      {item.avatarUrl ? (
        <Image source={{ uri: item.avatarUrl }} style={styles.uAv} />
      ) : (
        <View
          style={[
            styles.uAv,
            {
              backgroundColor: C.accent,
              alignItems: "center",
              justifyContent: "center",
            },
          ]}
        >
          <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 18 }}>
            {item.username?.charAt(0)?.toUpperCase()}
          </Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[styles.uName, { color: C.text.primary }]}>
          @{item.username}
        </Text>
        <Text style={[styles.uFol, { color: C.text.muted }]}>
          {item.followerCount || 0} followers
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.text.muted} />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.c, { backgroundColor: C.background }]}>
      <View style={[styles.h, { borderBottomColor: C.border }]}>
        <Text style={[styles.title, { color: C.text.primary }]}>Explore</Text>
      </View>

      <View
        style={[
          styles.sb,
          { backgroundColor: C.surface, borderColor: C.border },
        ]}
      >
        <Ionicons name="search" size={20} color={C.text.muted} />
        <TextInput
          style={[styles.inp, { color: C.text.primary }]}
          placeholder={
            searchType === "hashtags" ? "Find topics..." : "Find people..."
          }
          placeholderTextColor={C.text.muted}
          value={searchText}
          onChangeText={setSearchText}
          onSubmitEditing={() => {
            if (searchType === "hashtags") {
              navigation.navigate("Hashtag", {
                hashtag: searchText.startsWith("#")
                  ? searchText
                  : `#${searchText}`,
              });
            }
          }}
          autoCapitalize="none"
        />
        {loading && <ActivityIndicator size="small" color="#FF6B35" />}
      </View>

      <View style={styles.tg}>
        <TouchableOpacity
          style={[
            styles.tgB,
            { backgroundColor: C.surface, borderColor: C.border },
            searchType === "hashtags" && {
              backgroundColor: C.accent,
              borderColor: C.accent,
            },
          ]}
          onPress={() => {
            setSearchType("hashtags");
            setResults([]);
          }}
        >
          <Text
            style={[
              styles.tgT,
              { color: C.text.muted },
              searchType === "hashtags" && { color: "#FFF" },
            ]}
          >
            Hashtags
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tgB,
            { backgroundColor: C.surface, borderColor: C.border },
            searchType === "users" && {
              backgroundColor: C.accent,
              borderColor: C.accent,
            },
          ]}
          onPress={() => {
            setSearchType("users");
            setResults([]);
          }}
        >
          <Text
            style={[
              styles.tgT,
              { color: C.text.muted },
              searchType === "users" && { color: "#FFF" },
            ]}
          >
            Users
          </Text>
        </TouchableOpacity>
      </View>

      {searchType === "users" ? (
        <FlatList
          data={results}
          renderItem={renderUserItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: Spacing.lg }}
          ListEmptyComponent={
            !loading && searchText.length > 1 ? (
              <Text style={[styles.emptyText, { color: C.text.muted }]}>
                No users found matching "{searchText}"
              </Text>
            ) : null
          }
        />
      ) : (
        <View style={styles.hashtagHint}>
          <Ionicons
            name="trending-up"
            size={40}
            color={C.text.muted}
            style={{ marginBottom: 10 }}
          />
          <Text style={{ color: C.text.muted, textAlign: "center" }}>
            Type a hashtag and press enter to explore recent Yaps.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1 },
  h: {
    paddingTop: 60,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
  },
  title: { fontSize: 28, fontWeight: "800" },
  sb: {
    flexDirection: "row",
    alignItems: "center",
    margin: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderRadius: 15,
    borderWidth: 1,
    gap: 10,
  },
  inp: { flex: 1, fontSize: 16, paddingVertical: 12 },
  tg: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginBottom: 20,
    gap: 12,
  },
  tgB: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: "center",
    borderWidth: 1,
  },
  tgT: { fontWeight: "700" },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  uAv: { width: 50, height: 50, borderRadius: 25 },
  uName: { fontWeight: "700", fontSize: 16 },
  uFol: { fontSize: 13, marginTop: 2 },
  emptyText: { textAlign: "center", marginTop: 40, fontSize: 16 },
  hashtagHint: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
});
