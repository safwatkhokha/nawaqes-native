// ─── Auth Context (JWT-based) ───────────────────────────────────────
import React, { useState, useEffect, createContext, useContext } from 'react';
import { api } from '../services/api';
import { User } from '../types';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { getDefaultAvatar } from '../utils/avatar';
import { connectWebSocket, disconnectWebSocket } from '../hooks/useWebSocket';

interface AuthContextType {
  currentUser: User | null;
  user: User | null; // alias for currentUser (used by some components)
  isLoggedIn: boolean;
  initializing: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string, interests?: string[], phone?: string, gender?: 'male' | 'female', dateOfBirth?: string) => Promise<boolean>;
  logout: () => void;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  refreshCurrentUser: () => Promise<void>;
  allUsers: User[];
  setCurrentUser: (user: User | null) => void;
}

export const AuthContext = createContext<AuthContextType>({
  currentUser: null, user: null, isLoggedIn: false, initializing: true,
  login: async () => false, register: async () => false,
  logout: () => {}, updateProfile: async () => {}, refreshCurrentUser: async () => {}, allUsers: [],
  setCurrentUser: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const { t } = useTranslation();

  // Use a ref for the isLoggingIn flag to ensure synchronous reads
  // in event handlers (React state may be stale due to batching)
  const isLoggingInRef = React.useRef(false);

  const login = async (email: string, password: string): Promise<boolean> => {
    isLoggingInRef.current = true;
    try {
      const data = await api.login(email, password);
      const user = mapApiUser(data.user);
      // Set token and user state atomically to prevent race conditions
      api.setToken(data.token); // Ensure token is explicitly set
      setCurrentUser(user);
      setIsLoggedIn(true);
      // Connect WebSocket after successful login
      connectWebSocket(data.token);
      toast.success(t('auth.welcomeUser', { name: user.name }));
      return true;
    } catch (err: any) {
      // Don't show session expired on login failure - show login failed instead
      const msg = err.message === i18n.t('api.sessionExpired') ? t('auth.loginFailed') : (err.message || t('auth.loginFailed'));
      toast.error(msg);
      return false;
    } finally {
      // Delay resetting the flag to allow any pending stale requests to finish
      setTimeout(() => { isLoggingInRef.current = false; }, 5000);
    }
  };

  const register = async (name: string, email: string, password: string, interests?: string[], phone?: string, gender?: 'male' | 'female', dateOfBirth?: string): Promise<boolean> => {
    isLoggingInRef.current = true;
    try {
      const data = await api.register(name, email, password, interests, phone, gender, dateOfBirth);
      const user = mapApiUser(data.user);
      api.setToken(data.token); // Ensure token is explicitly set
      setCurrentUser(user);
      setIsLoggedIn(true);
      // Connect WebSocket after successful registration
      connectWebSocket(data.token);
      toast.success(t('auth.accountCreated', { name }));
      return true;
    } catch (err: any) {
      toast.error(err.message || t('auth.accountCreationFailed'));
      return false;
    } finally {
      setTimeout(() => { isLoggingInRef.current = false; }, 5000);
    }
  };

  const logout = () => {
    // Disconnect WebSocket before clearing session
    disconnectWebSocket();
    api.setToken(null);
    setCurrentUser(null);
    setIsLoggedIn(false);
    toast.info(t('auth.loggedOut'));
  };

  const updateProfile = async (updates: Partial<User>) => {
    try {
      const data = await api.updateProfile(updates as any);
      setCurrentUser(mapApiUser(data));
    } catch (err: any) {
      toast.error(err.message || t('auth.profileUpdateFailed'));
    }
  };

  // Refresh current user data from server without triggering a profile update API call
  // Use this after operations that change server-side state (wallet balance, etc.)
  const refreshCurrentUser = async () => {
    try {
      const data = await api.getMe();
      setCurrentUser(mapApiUser(data));
    } catch {
      // Silently fail - the local state will be stale but not broken
    }
  };

  // Track whether we've completed initial auth check
  const authCheckedRef = React.useRef(false);

  // Check for existing session on mount
  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const init = async () => {
      const token = api.getToken();
      if (token) {
        try {
          const data = await api.getMe();
          setCurrentUser(mapApiUser(data));
          setIsLoggedIn(true);
        } catch (err: any) {
          // Only clear token on 401 (authentication error)
          // Don't clear on network errors - the token might still be valid
          const isSessionExpired = err?.message === i18n.t('api.sessionExpired');
          if (isSessionExpired) {
            // Token is stale/invalid - clear silently without triggering logout toast
            api.setToken(null);
          } else {
            // Network error or other issue - keep the token but DON'T fabricate
            // a fake user (the previous "id: 'pending'" placeholder leaked into
            // API calls and UI state). Instead, keep currentUser null and
            // isLoggedIn false so RequireAuth shows the login screen. The user
            // can retry login once the network is back; their token is still
            // in localStorage so manual refresh will retry getMe().
            //
            // Schedule a single retry to fetch user data after 3s.
            retryTimer = setTimeout(async () => {
              try {
                const data = await api.getMe();
                setCurrentUser(mapApiUser(data));
                setIsLoggedIn(true);
              } catch {
                // Retry failed — stay logged out; user can refresh manually.
              }
            }, 3000);
          }
        }
      }
      setInitializing(false);
      authCheckedRef.current = true;
    };
    init();
    // Cleanup retry timer on unmount to avoid state updates after unmount.
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  // Listen for auth expired events - only act after initial check is done
  // During initialization, a stale token will trigger auth:expired but we
  // don't want to show a confusing 'logged out' toast to a user who wasn't logged in
  // Also, during login, don't process auth:expired from stale requests
  // IMPORTANT: Use a ref for isLoggingIn to avoid stale closure issues
  const isLoggedInRef = React.useRef(false);
  isLoggedInRef.current = isLoggedIn;

  // Keep a ref to the current user ID to detect legitimate session expiry
  // vs. stale requests from a previous session
  const currentUserIdRef = React.useRef<string | null>(null);
  currentUserIdRef.current = currentUser?.id ?? null;

  useEffect(() => {
    const handler = (e: Event) => {
      // Skip if we're in the middle of logging in (stale request race condition)
      if (isLoggingInRef.current) return;
      // Skip if initial auth check hasn't completed yet
      if (!authCheckedRef.current) return;
      // Only show logout toast if user was actually logged in
      if (isLoggedInRef.current) {
        setCurrentUser(null);
        setIsLoggedIn(false);
        toast.info(t('auth.loggedOut'));
      }
    };
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, user: currentUser, isLoggedIn, initializing, login, register, logout, updateProfile, refreshCurrentUser, allUsers, setCurrentUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// Map API user to frontend User type
function mapApiUser(data: any): User {
  return {
    id: data.id,
    name: data.name,
    avatar: data.avatar || getDefaultAvatar(data.name, data.gender),
    isVerified: !!data.is_verified,
    isAdmin: !!data.is_admin,
    isTrusted: !!data.is_trusted,
    walletBalance: data.wallet_balance ?? 0,
    trustScore: data.trust_score ?? 50,
    showPhone: !!data.show_phone,
    showLocation: !!data.show_location,
    gender: data.gender || 'male',
    phone: data.phone || '',
    location: data.location || '',
    bio: data.bio || '',
    coverPhoto: data.cover_photo || '',
    interests: Array.isArray(data.interests) ? data.interests : (() => { try { return JSON.parse(data.interests || '[]'); } catch { return []; } })(),
    paymentMethods: Array.isArray(data.payment_methods) ? data.payment_methods : (() => { try { return JSON.parse(data.payment_methods || '[]'); } catch { return []; } })(),
    joinDate: data.join_date || data.created_at,
    avatarBase64: data.avatar_base64,
    isDeactivated: !!data.is_deactivated,
    dateOfBirth: data.date_of_birth || '',
  };
}
