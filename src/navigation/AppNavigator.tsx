// ─── Navigation Setup ───────────────────────────────────────────────
// React Navigation with auth flow + bottom tabs + stack screens.

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../contexts/AuthContext';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import { Home, Wallet, User, Plus, MessageCircle, Search, Bell, ShoppingBag, Video } from 'lucide-react-native';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import HomeScreen from '../screens/HomeScreen';
import WalletScreen from '../screens/WalletScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ChannelsScreen from '../screens/ChannelsScreen';
import CreatePostScreen from '../screens/CreatePostScreen';
import PostDetailScreen from '../screens/PostDetailScreen';
import ChatListScreen from '../screens/ChatListScreen';
import ChatConversationScreen from '../screens/ChatConversationScreen';
import SearchScreen from '../screens/SearchScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import { NotificationProvider } from '../contexts/NotificationContext';

// ─── Bottom Tabs ────────────────────────────────────────────────────
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1e293b',
          borderTopColor: '#334155',
          paddingBottom: 4,
          height: 60,
        },
        tabBarActiveTintColor: '#f97316',
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'الرئيسية',
          tabBarIcon: ({ color }) => <Home color={color} size={22} />,
        }}
      />
      <Tab.Screen
        name="Create"
        component={CreatePostScreen}
        options={{
          tabBarLabel: 'إضافة',
          tabBarIcon: ({ color }) => <Plus color="#fff" size={24} />,
          tabBarIconStyle: { backgroundColor: '#f97316', borderRadius: 20, padding: 6, marginTop: -4 },
        }}
      />
      <Tab.Screen
        name="Channels"
        component={ChannelsScreen}
        options={{
          tabBarLabel: 'قنوات',
          tabBarIcon: ({ color }) => <Video color={color} size={22} />,
        }}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{
          tabBarLabel: 'محفظتي',
          tabBarIcon: ({ color }) => <Wallet color={color} size={22} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'حسابي',
          tabBarIcon: ({ color }) => <User color={color} size={22} />,
        }}
      />
    </Tab.Navigator>
  );
}

// ─── Root Stack ─────────────────────────────────────────────────────
const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { isAuthenticated, isLoading, user } = useAuth();

  // 🔧 Safety timeout: if isLoading stays true for >5s, force-show login.
  // This prevents the app from getting stuck on a black loading screen
  // if the network is slow or SecureStore hangs.
  const [forceLogin, setForceLogin] = React.useState(false);
  useEffect(() => {
    if (!isLoading) return;
    const t = setTimeout(() => setForceLogin(true), 5000);
    return () => clearTimeout(t);
  }, [isLoading]);

  if (isLoading && !forceLogin) {
    return (
      <View style={styles.loading}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>N</Text>
        </View>
        <Text style={styles.loadingText}>نواقص</Text>
        <ActivityIndicator size="large" color="#f97316" style={{ marginTop: 20 }} />
        <Text style={styles.loadingSubtext}>جارٍ التحميل...</Text>
      </View>
    );
  }

  // If forced past loading, treat as not authenticated
  const showAuth = isAuthenticated && !forceLogin;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {showAuth ? (
          <NotificationProvider>
            <>
              <Stack.Screen name="Main" component={MainTabs} />
              <Stack.Screen
                name="CreatePost"
                component={CreatePostScreen}
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen name="PostDetail" component={PostDetailScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
              <Stack.Screen name="ChatList" component={ChatListScreen} />
              <Stack.Screen name="ChatConversation" component={ChatConversationScreen} />
              <Stack.Screen name="Search" component={SearchScreen} />
              <Stack.Screen name="Notifications" component={NotificationsScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              {user?.is_admin ? (
                <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
              ) : null}
            </>
          </NotificationProvider>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen
              name="Register"
              component={RegisterScreen}
              options={{ animation: 'slide_from_right' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoText: {
    color: '#fff',
    fontSize: 56,
    fontWeight: '900',
  },
  loadingText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
  },
  loadingSubtext: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 8,
  },
});
