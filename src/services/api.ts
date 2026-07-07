// ─── API Configuration ──────────────────────────────────────────────
// Central API client for the Nawaqes native app.
// Reuses the same backend API as the web app.

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// ─── Backend URL ────────────────────────────────────────────────────
// Production: Hugging Face Spaces deployment
const API_BASE_URL = 'https://safwatkhokha-nawaqes.hf.space/api';

// ─── Token storage (secure on device) ───────────────────────────────
const TOKEN_KEY = 'nawaqes_jwt_token';
const USER_KEY = 'nawaqes_user_data';

export async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function storeToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

export async function storeUser(user: any): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function getStoredUser(): Promise<any | null> {
  try {
    const data = await SecureStore.getItemAsync(USER_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

// ─── Axios instance ─────────────────────────────────────────────────
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': `Nawaqes-Native/${Platform.OS}`,
  },
});

// ─── Request interceptor: attach JWT ────────────────────────────────
apiClient.interceptors.request.use(
  async (config) => {
    const token = await getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response interceptor: handle 401 ───────────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired — clear and redirect to login
      await clearToken();
    }
    return Promise.reject(error);
  }
);

// ─── API methods ────────────────────────────────────────────────────
export const api = {
  client: apiClient,
  getToken: getStoredToken,

  // ─── Auth ─────────────────────────────────────────────────────────
  async login(email: string, password: string) {
    const res = await apiClient.post('/auth/login', { email, password });
    if (res.data.token) await storeToken(res.data.token);
    if (res.data.user) await storeUser(res.data.user);
    return res.data;
  },

  async register(data: { name: string; email: string; password: string; phone: string; gender?: string }) {
    const res = await apiClient.post('/auth/register', data);
    if (res.data.token) await storeToken(res.data.token);
    if (res.data.user) await storeUser(res.data.user);
    return res.data;
  },

  async logout() {
    await clearToken();
  },

  async getProfile() {
    const res = await apiClient.get('/auth/me');
    return res.data;
  },

  // ─── Posts / Feed ─────────────────────────────────────────────────
  async getFeed(page = 1, limit = 10) {
    const res = await apiClient.get(`/posts?page=${page}&limit=${limit}`);
    return res.data;
  },

  async createPost(data: any) {
    const res = await apiClient.post('/posts', data);
    return res.data;
  },

  async likePost(postId: string) {
    const res = await apiClient.post(`/posts/${postId}/like`);
    return res.data;
  },

  // ═══ NEW: TikTok-style Streams API (replaces market-live + channels) ═══
  async getStreamsFeed() {
    const res = await apiClient.get('/streams/feed');
    return res.data;
  },

  async getActiveStreams() {
    const res = await apiClient.get('/streams/active');
    return res.data;
  },

  async getStream(id: string) {
    const res = await apiClient.get(`/streams/${id}`);
    return res.data;
  },

  async startStream(data: { title?: string; description?: string; streamUrl?: string; thumbnailUrl?: string }) {
    const res = await apiClient.post('/streams/start', data);
    return res.data;
  },

  async endStream(id: string, recordingUrl?: string) {
    const res = await apiClient.post(`/streams/${id}/end`, { recordingUrl });
    return res.data;
  },

  async joinStream(id: string) {
    const res = await apiClient.post(`/streams/${id}/viewer-join`);
    return res.data;
  },

  async leaveStream(id: string) {
    const res = await apiClient.post(`/streams/${id}/viewer-leave`);
    return res.data;
  },

  async likeStream(id: string) {
    const res = await apiClient.post(`/streams/${id}/like`);
    return res.data;
  },

  async saveStream(id: string) {
    const res = await apiClient.post(`/streams/${id}/save`);
    return res.data;
  },

  async shareStream(id: string) {
    const res = await apiClient.post(`/streams/${id}/share`);
    return res.data;
  },

  async getStreamChat(id: string) {
    const res = await apiClient.get(`/streams/${id}/chat`);
    return res.data;
  },

  async sendStreamChat(id: string, text: string) {
    const res = await apiClient.post(`/streams/${id}/chat`, { text });
    return res.data;
  },

  async getStreamGifts(id: string) {
    const res = await apiClient.get(`/streams/${id}/gifts`);
    return res.data;
  },

  async sendStreamGift(id: string, giftType: string, message?: string) {
    const res = await apiClient.post(`/streams/${id}/gift`, { giftType, message });
    return res.data;
  },

  async getGiftCatalog() {
    const res = await apiClient.get('/streams/gifts/catalog');
    return res.data;
  },

  async getUserProfile(userId: string) {
    const res = await apiClient.get(`/users/${userId}`);
    return res.data;
  },

  async followUser(userId: string) {
    const res = await apiClient.post(`/users/${userId}/follow`);
    return res.data;
  },

  async unfollowUser(userId: string) {
    const res = await apiClient.delete(`/users/${userId}/follow`);
    return res.data;
  },

  // ─── Wallet ───────────────────────────────────────────────────────
  async getWalletBalance() {
    const res = await apiClient.get('/wallet/balance');
    return res.data;
  },

  async getTransactions() {
    const res = await apiClient.get('/wallet/transactions');
    return res.data;
  },

  // ─── File uploads ─────────────────────────────────────────────────
  async uploadImage(uri: string, onProgress?: (percent: number) => void) {
    const formData = new FormData();
    formData.append('image', {
      uri,
      type: 'image/jpeg',
      name: 'upload.jpg',
    } as any);

    const token = await getStoredToken();
    const res = await apiClient.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
    });
    return res.data;
  },

  async uploadVideo(uri: string, onProgress?: (percent: number) => void) {
    const formData = new FormData();
    formData.append('video', {
      uri,
      type: 'video/mp4',
      name: 'upload.mp4',
    } as any);

    const token = await getStoredToken();
    const res = await apiClient.post('/videos/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
      timeout: 600000,
    });
    return res.data;
  },
};

export default api;
