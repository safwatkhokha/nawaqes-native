// ─── Auth Context ───────────────────────────────────────────────────
// Manages user authentication state across the app.
// Uses SecureStore for JWT persistence (encrypted on device).

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, getStoredToken, getStoredUser, clearToken } from '../services/api';

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  is_verified?: boolean;
  is_admin?: boolean;
  wallet_balance?: number;
  gift_balance?: number;
  gender?: string;
  phone?: string;
  trust_score?: number;
  location?: string;
  bio?: string;
  followers_count?: number;
  following_count?: number;
  join_date?: string;
  show_phone?: boolean;
  show_location?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; phone: string; gender?: string; dateOfBirth?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ─── Check stored auth on app launch ───────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const storedToken = await getStoredToken();
        const storedUser = await getStoredUser();
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(storedUser);
          // Verify token is still valid by fetching profile
          try {
            const profile = await api.getProfile();
            setUser(profile);
          } catch {
            // Token expired
            await clearToken();
            setToken(null);
            setUser(null);
          }
        }
      } catch (e) {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const result = await api.login(email, password);
    setToken(result.token);
    setUser(result.user);
  };

  const register = async (data: { name: string; email: string; password: string; phone: string; gender?: string }) => {
    const result = await api.register(data);
    setToken(result.token);
    setUser(result.user);
  };

  const logout = async () => {
    await api.logout();
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const profile = await api.getProfile();
      setUser(profile);
    } catch {}
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!token && !!user,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
