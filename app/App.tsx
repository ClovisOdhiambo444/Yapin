import { ProfilePicProvider } from './src/theme/ProfilePicContext';
import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator, StatusBar, Platform, Animated, Text } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { onAuthChange, auth, db } from './src/services/firebase';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Colors, LightColors } from './src/theme/colors';
import { ThemeContext } from './src/theme/ThemeContext';
import GlassRecordOverlay from './src/components/GlassRecordOverlay';
import AuthScreen from './src/screens/AuthScreen';
import FeedScreen from './src/screens/FeedScreen';
import SearchScreen from './src/screens/SearchScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import HashtagScreen from './src/screens/HashtagScreen';
import UserProfileScreen from './src/screens/UserProfileScreen';
import ConvoScreen from './src/screens/ConvoScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function PulsingDot({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1.5, duration: 500, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={{ position: 'absolute', top: -3, right: -4, width: 9, height: 9, borderRadius: 5, backgroundColor: color, transform: [{ scale: anim }] }} />;
}

function TabNavigator() {
  const { isDark } = React.useContext(ThemeContext);
  const C = isDark ? Colors : LightColors;
  const [showRecord, setShowRecord] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;
    const q = query(collection(db, 'notifications'), where('toUserId', '==', u.uid), where('read', '==', false));
    const unsub = onSnapshot(q, (s) => setUnreadCount(s.size));
    return unsub;
  }, []);

  return (
    <>
      <Tab.Navigator screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.border, borderTopWidth: 0.5, height: Platform.OS === 'ios' ? 85 : 65, paddingBottom: Platform.OS === 'ios' ? 25 : 10, paddingTop: 10 },
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.text.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'radio-outline';
          if (route.name === 'Yaps') iconName = focused ? 'radio' : 'radio-outline';
          else if (route.name === 'Search') iconName = focused ? 'search' : 'search-outline';
          else if (route.name === 'Create') return (
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center', marginBottom: 4, shadowColor: '#FF6B35', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 5 }}>
              <Ionicons name="mic" size={26} color="#FFFFFF" />
            </View>
          );
          else if (route.name === 'Notifications') {
            iconName = focused ? 'notifications' : 'notifications-outline';
            return (
              <View>
                <Ionicons name={iconName} size={size} color={color} />
                {unreadCount > 0 && <PulsingDot color="#FF6B35" />}
              </View>
            );
          }
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}>
        <Tab.Screen name="Yaps" component={FeedScreen} />
        <Tab.Screen name="Search" component={SearchScreen} />
        <Tab.Screen name="Create" component={View} options={{ tabBarLabel: '' }} listeners={{ tabPress: (e) => { e.preventDefault(); setShowRecord(true); } }} />
        <Tab.Screen name="Notifications" component={NotificationsScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>
      <GlassRecordOverlay visible={showRecord} onClose={() => setShowRecord(false)} />
    </>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => { const u = onAuthChange((cu) => { setUser(cu); setLoading(false); }); return u; }, []);

  if (loading) return <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color="#FF6B35" /></View>;

  const C = isDark ? Colors : LightColors;
  const navTheme = isDark ? DarkTheme : DefaultTheme;

  return (
    <SafeAreaProvider>
      <ProfilePicProvider>
      <ProfilePicProvider>
      <ThemeContext.Provider value={{ isDark, toggleTheme: () => setIsDark(!isDark) }}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <NavigationContainer theme={{ ...navTheme, colors: { ...navTheme.colors, background: C.background, card: C.surface, border: C.border, text: C.text.primary, primary: C.accent } }}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {user ? (
              <>
                <Stack.Screen name="Main" component={TabNavigator} />
                <Stack.Screen name="Hashtag" component={HashtagScreen} />
                <Stack.Screen name="UserProfile" component={UserProfileScreen} />
                <Stack.Screen name="Convo" component={ConvoScreen} />
              </>
            ) : (
              <Stack.Screen name="Auth" component={AuthScreen} />
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </ThemeContext.Provider>
    </ProfilePicProvider>
    </ProfilePicProvider>
    </SafeAreaProvider>
  );
}
