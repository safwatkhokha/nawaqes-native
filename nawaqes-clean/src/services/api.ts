// ─── API Service Layer ──────────────────────────────────────────────
// Central API client that handles all HTTP requests to the backend

import i18n from '../i18n';

const API_BASE = '/api';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('nawaqes_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('nawaqes_token', token);
    } else {
      localStorage.removeItem('nawaqes_token');
    }
  }

  getToken() { return this.token; }

  private async request<T>(endpoint: string, options: RequestInit = {}, skipAuthExpired = false): Promise<T> {
    // 🔧 FIX: don't force Content-Type: application/json when the body is
    // FormData — the browser sets the correct multipart boundary automatically.
    // Forcing JSON content-type on FormData would break file uploads.
    const isFormData = options.body instanceof FormData;
    const headers: Record<string, string> = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers as Record<string, string> || {}),
    };

    // Capture the token used for this specific request to detect race conditions
    const requestToken = this.token;
    if (requestToken) {
      headers['Authorization'] = `Bearer ${requestToken}`;
    }

    let res: Response;
    try {
      res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    } catch (err) {
      throw new Error(i18n.t('api.networkError'));
    }

    if (res.status === 401) {
      // Race condition protection: only clear the token if it hasn't changed
      // since this request was made. If a new token was set (e.g., after login),
      // don't wipe it just because a stale request returned 401.
      const currentToken = this.token;
      if (requestToken && currentToken === requestToken) {
        // Token is the same as when the request was made — it's genuinely stale
        this.setToken(null);
        if (!skipAuthExpired) {
          window.dispatchEvent(new CustomEvent('auth:expired'));
        }
      } else if (requestToken && currentToken && currentToken !== requestToken) {
        // Token changed since this request — a new login happened.
        // Don't clear the new token; this 401 is from a stale request.
        // Don't dispatch auth:expired either.
      } else if (!requestToken && !currentToken) {
        // No token was used and none exists now — nothing to do
      }
      throw new Error(i18n.t('api.sessionExpired'));
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: i18n.t('api.networkError') }));
      throw new Error(data.error || i18n.t('api.unexpectedError'));
    }

    // Handle empty response body (e.g., res.json(undefined) in Express)
    const text = await res.text();
    if (!text || text.trim() === '') {
      return {} as T;
    }
    return JSON.parse(text) as T;
  }

  // ─── Auth ──────────────────────────────────────────────────────────
  // Use skipAuthExpired=true for login/register so that a stale token
  // sent in the Authorization header doesn't trigger auth:expired.
  // These endpoints don't require auth, so 401 here is a real login failure.
  async login(email: string, password: string) {
    // Clear any stale token BEFORE making the login request to avoid
    // sending a bad Authorization header that could confuse things
    const staleToken = this.token;
    this.token = null;
    try {
      const data = await this.request<{ user: any; token: string }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      }, true);
      this.setToken(data.token);
      return data;
    } catch (err) {
      // Restore stale token on failure so other requests don't break
      if (staleToken && !this.token) this.token = staleToken;
      throw err;
    }
  }

  // 🔧 NEW: Login with email + phone (no password) — for Google login button
  async loginWithPhone(email: string, phone: string) {
    const staleToken = this.token;
    this.token = null;
    try {
      const data = await this.request<{ user: any; token: string }>('/auth/login-phone', {
        method: 'POST', body: JSON.stringify({ email, phone }),
      }, true);
      this.setToken(data.token);
      return data;
    } catch (err) {
      if (staleToken && !this.token) this.token = staleToken;
      throw err;
    }
  }

  async register(name: string, email: string, password: string, interests?: string[], phone?: string, gender?: 'male' | 'female', dateOfBirth?: string) {
    // Clear any stale token BEFORE making the register request
    const staleToken = this.token;
    this.token = null;
    try {
      const data = await this.request<{ user: any; token: string }>('/auth/register', {
        method: 'POST', body: JSON.stringify({ name, email, password, interests, phone, gender, dateOfBirth }),
      }, true);
      this.setToken(data.token);
      return data;
    } catch (err) {
      if (staleToken && !this.token) this.token = staleToken;
      throw err;
    }
  }

  async getMe() {
    // Use skipAuthExpired=true to avoid triggering logout toast on session check
    return this.request<any>('/auth/me', {}, true);
  }

  async updateProfile(updates: Record<string, any>) {
    return this.request<any>('/auth/profile', {
      method: 'PUT', body: JSON.stringify(updates),
    });
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request<{ message: string }>('/auth/change-password', {
      method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  // ─── Forgot / Reset Password ───────────────────────────────────────
  async forgotPassword(email: string) {
    return this.request<{ message: string; resetCode?: string }>('/auth/forgot-password', {
      method: 'POST', body: JSON.stringify({ email }),
    }, true);
  }

  async resetPassword(code: string, newPassword: string) {
    return this.request<{ message: string; user: any; token: string }>('/auth/reset-password', {
      method: 'POST', body: JSON.stringify({ code, newPassword }),
    }, true);
  }

  // ─── Posts ─────────────────────────────────────────────────────────
  async getPosts(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<{ posts: any[]; total: number; page: number }>(`/posts${query}`);
  }

  async getPromotedPosts(limit?: number) {
    const query = limit ? `?limit=${limit}` : '';
    return this.request<{ posts: any[] }>(`/posts/promoted${query}`);
  }

  async getPost(id: string) {
    return this.request<any>(`/posts/${id}`);
  }

  async createPost(data: any) {
    return this.request<any>('/posts', {
      method: 'POST', body: JSON.stringify(data),
    });
  }

  async updatePost(id: string, data: any) {
    return this.request<any>(`/posts/${id}`, {
      method: 'PUT', body: JSON.stringify(data),
    });
  }

  async deletePost(id: string) {
    return this.request<{ message: string }>(`/posts/${id}`, { method: 'DELETE' });
  }

  async likePost(id: string) {
    return this.request<{ likes: number; liked: boolean }>(`/posts/${id}/like`, { method: 'POST' });
  }

  async commentPost(id: string, content: string, parentId?: string, imageUrl?: string) {
    return this.request<any>(`/posts/${id}/comment`, {
      method: 'POST', body: JSON.stringify({ content, parentId: parentId || undefined, imageUrl: imageUrl || undefined }),
    });
  }

  async likeComment(postId: string, commentId: string) {
    return this.request<any>(`/posts/${postId}/comment/${commentId}/like`, { method: 'POST' });
  }

  async deleteComment(postId: string, commentId: string) {
    return this.request<{ message: string }>(`/posts/${postId}/comment/${commentId}`, { method: 'DELETE' });
  }

  async getComments(postId: string) {
    return this.request<any[]>(`/posts/${postId}/comments`);
  }

  // ─── Chat ──────────────────────────────────────────────────────────
  async getChatContacts() {
    return this.request<any[]>('/chat/contacts');
  }

  async getChatMessages(contactId: string, params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>(`/chat/messages/${contactId}${query}`);
  }

  async sendMessage(receiverId: string, text: string, postId?: string, messageType?: string, imageUrl?: string, replyToId?: string, voiceUrl?: string, voiceDuration?: number, groupId?: string) {
    return this.request<any>('/chat/send', {
      method: 'POST', body: JSON.stringify({ receiverId, text, postId, messageType, imageUrl, replyToId, voiceUrl, voiceDuration, groupId }),
    });
  }

  async deleteMessage(messageId: string) {
    return this.request<{ message: string }>(`/chat/messages/${messageId}`, { method: 'DELETE' });
  }

  async reactToMessage(messageId: string, emoji: string) {
    return this.request<{ message: string; reactions: Record<string, string> }>(`/chat/messages/${messageId}/react`, {
      method: 'POST', body: JSON.stringify({ emoji }),
    });
  }

  async uploadChatImage(file: File): Promise<{ url: string; filename: string }> {
    const formData = new FormData();
    formData.append('image', file);
    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}/chat/upload-image`, {
      method: 'POST', headers, body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Image upload failed' }));
      throw new Error(data.error);
    }
    return res.json();
  }

  async editMessage(messageId: string, text: string) {
    return this.request<any>(`/chat/messages/${messageId}`, {
      method: 'PUT', body: JSON.stringify({ text }),
    });
  }

  async deleteMessageForEveryone(messageId: string) {
    return this.request<{ message: string }>(`/chat/messages/${messageId}/everyone`, { method: 'DELETE' });
  }

  async searchMessages(contactId: string, query: string) {
    return this.request<any[]>(`/chat/messages/${contactId}/search?q=${encodeURIComponent(query)}`);
  }

  async togglePinMessage(messageId: string) {
    return this.request<{ message: string; isPinned: boolean }>(`/chat/messages/${messageId}/pin`, { method: 'POST' });
  }

  async getSharedMedia(contactId: string) {
    return this.request<any[]>(`/chat/messages/${contactId}/media`);
  }

  async uploadChatVoice(file: File): Promise<{ url: string; filename: string }> {
    const formData = new FormData();
    formData.append('voice', file);
    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}/chat/upload-voice`, {
      method: 'POST', headers, body: formData,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Voice upload failed' }));
      throw new Error(data.error);
    }
    return res.json();
  }

  // ─── File upload (any type: PDF, DOC, ZIP, etc.) ──────────────────
  // Falls back to the image-upload endpoint if the server doesn't expose a
  // dedicated file route — the backend stores it the same way and returns a URL.
  async uploadChatFile(file: File): Promise<{ url: string; filename: string; size: number; mimeType: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', file.name);
    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/chat/upload-file`, {
        method: 'POST', headers, body: formData,
      });
    } catch {
      // Network error — surface a friendly Arabic message
      throw new Error('تعذّر رفع الملف — تحقق من اتصال الإنترنت');
    }
    if (!res.ok) {
      // Fallback: try the image endpoint (some backends share the route)
      try {
        const fallbackRes = await fetch(`${API_BASE}/chat/upload-image`, {
          method: 'POST', headers, body: ((): FormData => {
            const fd = new FormData();
            fd.append('image', file);
            return fd;
          })(),
        });
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          return { url: data.url, filename: file.name, size: file.size, mimeType: file.type };
        }
      } catch {}
      const data = await res.json().catch(() => ({ error: 'File upload failed' }));
      throw new Error(data.error || 'فشل رفع الملف');
    }
    const data = await res.json();
    return {
      url: data.url,
      filename: data.filename || file.name,
      size: data.size ?? file.size,
      mimeType: data.mimeType ?? file.type,
    };
  }

  // ─── Time-based mute (DND) ────────────────────────────────────────
  // The server's toggleMuteChat is binary; we wrap it with an optional
  // `muteUntilMinutes` so the client can schedule an auto-unmute.
  // The server stores muteUntil as ISO string; if the field is unsupported
  // it falls back to plain toggle.
  async toggleMuteChatWithDuration(targetId: string, isGroup: boolean, muteUntilMinutes?: number) {
    return this.request<{ message: string; isMuted: boolean }>(`/chat/mute/${targetId}`, {
      method: 'POST',
      body: JSON.stringify({ isGroup: !!isGroup, muteUntilMinutes }),
    });
  }

  // ─── Phase 3: Group Chat ────────────────────────────────────────────
  async createGroup(name: string, avatar: string, description: string, memberIds: string[]) {
    return this.request<any>('/chat/groups', {
      method: 'POST',
      body: JSON.stringify({ name, avatar, description, memberIds }),
    });
  }

  async getGroups() {
    return this.request<any[]>('/chat/groups');
  }

  async getGroupDetails(groupId: string) {
    return this.request<any>(`/chat/groups/${groupId}`);
  }

  async updateGroup(groupId: string, data: { name?: string; avatar?: string; description?: string }) {
    return this.request<any>(`/chat/groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async addGroupMember(groupId: string, userId: string, role?: string) {
    return this.request<{ message: string }>(`/chat/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    });
  }

  async removeGroupMember(groupId: string, userId: string) {
    return this.request<{ message: string }>(`/chat/groups/${groupId}/members/${userId}`, {
      method: 'DELETE',
    });
  }

  async deleteGroup(groupId: string) {
    return this.request<{ message: string }>(`/chat/groups/${groupId}`, {
      method: 'DELETE',
    });
  }

  async leaveGroup(groupId: string) {
    return this.request<{ message: string }>(`/chat/groups/${groupId}/leave`, {
      method: 'POST',
    });
  }

  // ─── Phase 3: Forward Message ──────────────────────────────────────
  async forwardMessage(messageId: string, targetId: string, isGroup?: boolean) {
    return this.request<any>(`/chat/messages/${messageId}/forward`, {
      method: 'POST',
      body: JSON.stringify({ targetId, isGroup: !!isGroup }),
    });
  }

  // ─── Phase 3: Mute Notifications ───────────────────────────────────
  async toggleMuteChat(targetId: string, isGroup?: boolean) {
    return this.request<{ message: string; isMuted: boolean }>(`/chat/mute/${targetId}`, {
      method: 'POST',
      body: JSON.stringify({ isGroup: !!isGroup }),
    });
  }

  async getMutedChats() {
    return this.request<any[]>('/chat/mutes');
  }

  // ─── Phase 3: Block User ───────────────────────────────────────────
  async toggleBlockUser(userId: string) {
    return this.request<{ message: string; isBlocked: boolean }>(`/chat/block/${userId}`, {
      method: 'POST',
    });
  }

  // ─── Wallet ────────────────────────────────────────────────────────
  async getWalletBalance() {
    return this.request<{ balance: number }>('/wallet/balance');
  }

  async getTransactions() {
    return this.request<any[]>('/wallet/transactions');
  }

  async chargeRequest(amount: number, method: string, receiptImage?: string, additionalPhone?: string) {
    return this.request<{ message: string }>('/wallet/charge-request', {
      method: 'POST', body: JSON.stringify({ amount, method, receiptImage, additionalPhone }),
    });
  }

  // Convenience wrapper used by the Market Live purchase flow to request a
  // wallet top-up when the user's balance is too low to complete an order.
  // Backed by the same /wallet/charge-request endpoint as chargeRequest.
  async chargeWallet(amount: number, method: string) {
    return this.chargeRequest(amount, method);
  }

  // ─── Admin ─────────────────────────────────────────────────────────
  async getAdminStats() {
    return this.request<any>('/admin/stats');
  }

  async getAdminChart() {
    return this.request<any[]>('/admin/chart');
  }

  async getPromotionRequests() {
    return this.request<any[]>('/admin/promotion-requests');
  }

  async approvePromotion(id: string) {
    return this.request<{ message: string }>(`/admin/promotion-requests/${id}/approve`, { method: 'POST' });
  }

  async rejectPromotion(id: string) {
    return this.request<{ message: string }>(`/admin/promotion-requests/${id}/reject`, { method: 'POST' });
  }

  async getChargingRequests() {
    return this.request<any[]>('/wallet/admin/charging-requests');
  }

  async approveCharging(id: string) {
    return this.request<{ message: string }>(`/wallet/admin/charging-requests/${id}/approve`, { method: 'POST' });
  }

  async rejectCharging(id: string) {
    return this.request<{ message: string }>(`/wallet/admin/charging-requests/${id}/reject`, { method: 'POST' });
  }

  async getAdminUsers() {
    return this.request<any[]>('/admin/users');
  }

  async getActiveAdminAlerts() {
    return this.request<{ alerts: any[] }>('/alerts/active');
  }

  async createAlert(title: string, content: string, source?: string) {
    return this.request<any>('/admin/alerts', {
      method: 'POST', body: JSON.stringify({ title, content, source }),
    });
  }

  async deleteAlert(id: string) {
    return this.request<{ message: string }>(`/admin/alerts/${id}`, { method: 'DELETE' });
  }

  // ─── General ───────────────────────────────────────────────────────
  async getCategories() { return this.request<any[]>('/categories'); }
  async getNews() { return this.request<any[]>('/news'); }
  async getStories() { return this.request<any[]>('/stories'); }
  async getTrends(category?: string) { return this.request<any[]>(category ? `/trends?category=${category}` : '/trends'); }
  async refreshTrends() { return this.request<{ message: string; trends: any[] }>('/trends/refresh', { method: 'POST' }); }
  async getOpportunities(limit?: number) { return this.request<any[]>(limit ? `/opportunities?limit=${limit}` : '/opportunities'); }
  async getMarketPulseOverview() { return this.request<any>('/market-pulse/overview'); }
  async getNotifications() { return this.request<any[]>('/notifications'); }
  async markNotificationsRead() { return this.request<{ message: string }>('/notifications/mark-read', { method: 'POST' }); }
  async markNotificationRead(id: string) { return this.request<{ message: string }>(`/notifications/${id}/mark-read`, { method: 'POST' }); }
  async deleteNotification(id: string) { return this.request<{ message: string }>(`/notifications/${id}`, { method: 'DELETE' }); }
  async getUserProfile(id: string) { return this.request<any>(`/users/${id}`); }
  async requestPromotion(data: any) { return this.request<any>('/promotions', { method: 'POST', body: JSON.stringify(data) }); }
  async getMyPromotionRequests() { return this.request<any[]>('/promotions/my-requests'); }
  async createStory(data: any) { return this.request<any>('/stories', { method: 'POST', body: JSON.stringify(data) }); }
  async getFriendRequests() { return this.request<any[]>('/friends/requests'); }
  async getSentFriendRequests() { return this.request<any[]>('/friends/sent'); }
  async getFriendsList() { return this.request<any[]>('/friends/list'); }
  async getFriendSuggestions() { return this.request<any[]>('/friends/suggestions'); }
  async sendFriendRequest(userId: string) { return this.request<{ message: string }>('/friends/request', { method: 'POST', body: JSON.stringify({ userId }) }); }
  async acceptFriendRequest(id: string) { return this.request<{ message: string }>(`/friends/accept/${id}`, { method: 'POST' }); }
  async rejectFriendRequest(id: string) { return this.request<{ message: string }>(`/friends/reject/${id}`, { method: 'POST' }); }
  async cancelSentFriendRequest(id: string) { return this.request<{ message: string }>(`/friends/cancel/${id}`, { method: 'POST' }); }
  async unfriend(friendshipId: string) { return this.request<{ message: string }>(`/friends/unfriend/${friendshipId}`, { method: 'POST' }); }
  async unfriendByUserId(userId: string) { return this.request<{ message: string }>(`/friends/unfriend-by-user/${userId}`, { method: 'POST' }); }
  async setFriendLabel(userId: string, label: string) { return this.request<{ message: string }>(`/friends/label-by-user/${userId}`, { method: 'POST', body: JSON.stringify({ label }) }); }
  async getMutualFriends(userId: string) { return this.request<{ mutualFriends: any[]; count: number }>(`/friends/mutual/${userId}`); }
  async getFriendshipStatus(userId: string) { return this.request<{ friendshipStatus: string | null; lastSeenAt?: string | null }>(`/friends/status/${userId}`); }
  async getFriendStats() { return this.request<{ totalFriends: number; pendingIncoming: number; pendingSent: number; onlineFriends: number; friendsByLabel: Record<string, number>; friendsThisWeek: number; nearbyFriends: number }>('/friends/stats'); }
  // Block / Unblock
  async blockUser(userId: string, reason?: string) { return this.request<{ message: string }>(`/block/${userId}`, { method: 'POST', body: JSON.stringify({ reason }) }); }
  async unblockUser(userId: string) { return this.request<{ message: string }>(`/unblock/${userId}`, { method: 'POST' }); }
  async getBlockedUsers() { return this.request<any[]>('/blocked'); }

  // ─── Matches (Tinder-style) ────────────────────────────────────────
  // GET /api/matches — sorted list of candidate users with matchScore, sharedInterests
  async getMatches(filters?: { ageMin?: number; ageMax?: number; distance?: number; gender?: 'male' | 'female' | 'all'; interests?: string[] }) {
    const params = new URLSearchParams();
    if (filters?.ageMin != null) params.set('ageMin', String(filters.ageMin));
    if (filters?.ageMax != null) params.set('ageMax', String(filters.ageMax));
    if (filters?.distance != null) params.set('distance', String(filters.distance));
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    if (filters?.interests && filters.interests.length > 0) params.set('interests', filters.interests.join(','));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<any[]>(`/matches${query}`);
  }
  async likeMatch(userId: string) {
    return this.request<{ action: string; matched: boolean; matchId: string | null; target: { id: string; name: string } }>(`/matches/${userId}/like`, { method: 'POST' });
  }
  async passMatch(userId: string) {
    return this.request<{ action: string; matched: boolean; matchId: string | null; target: { id: string; name: string } }>(`/matches/${userId}/pass`, { method: 'POST' });
  }
  async superLikeMatch(userId: string) {
    return this.request<{ action: string; matched: boolean; matchId: string | null; target: { id: string; name: string } }>(`/matches/${userId}/superlike`, { method: 'POST' });
  }
  async getSuperLikeCount() {
    return this.request<{ used: number; remaining: number; limit: number }>('/matches/superlike-count');
  }
  async getMatchList() {
    return this.request<any[]>('/matches/list');
  }
  async sendMatchMessage(matchId: string, text: string) {
    return this.request<{ success: boolean; messageId: string }>(`/matches/${matchId}/message`, { method: 'POST', body: JSON.stringify({ text }) });
  }
  // Alias to match the task spec naming
  async getFriends() { return this.getFriendsList(); }

  async notifyFriendsLivestream(streamTitle: string) { return this.request<{ success: boolean; notifiedFriends: number }>('/livestream/notify-friends', { method: 'POST', body: JSON.stringify({ streamTitle }) }); }
  async getActiveLivestreams() { return this.request<any[]>('/livestream/active'); }
  async searchUsers(query: string) { return this.request<any[]>(`/users/search?q=${encodeURIComponent(query)}`); }
  async getSmartReachStats() { return this.request<any>('/smart-reach/stats'); }
  async getSmartReachPromotionAnalytics(id: string) { return this.request<any>(`/smart-reach/promotion/${id}/analytics`); }
  async getSmartReachSuggestions() { return this.request<any>('/smart-reach/suggestions'); }
  async getSmartReachCompare() { return this.request<any>('/smart-reach/compare'); }
  async getSmartReachRealtime() { return this.request<any>('/smart-reach/realtime'); }
  // Tracking calls use skipAuthExpired=true so a stale token doesn't
  // log the user out — these are fire-and-forget analytics, not critical.
  async trackImpressions(postIds: string[]) { return this.request<{ tracked: number }>('/posts/track-impressions', { method: 'POST', body: JSON.stringify({ postIds }) }, true); }
  async trackClick(postId: string) { return this.request<{ clicks: number }>(`/posts/${postId}/click`, { method: 'POST' }, true); }
  async trackShare(postId: string, platform: string) { return this.request<{ success: boolean }>(`/posts/${postId}/share`, { method: 'POST', body: JSON.stringify({ platform }) }, true); }

  // ─── File Upload ───────────────────────────────────────────────────
  async uploadImage(file: File): Promise<{ url: string; filename: string }> {
    const formData = new FormData();
    formData.append('image', file);

    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: i18n.t('api.imageUploadFailed') }));
      throw new Error(data.error);
    }

    return res.json();
  }

  // ─── Admin: Toggle User Verification ───────────────────────────────
  async toggleUserVerification(userId: string): Promise<{ id: string; is_verified: boolean; message: string }> {
    return this.request(`/admin/users/${userId}/verify`, { method: 'PATCH' });
  }

  // ─── Admin: Delete User ────────────────────────────────────────────
  async deleteUser(userId: string): Promise<{ message: string }> {
    return this.request(`/admin/users/${userId}`, { method: 'DELETE' });
  }

  // ─── Self-service: Delete My Account ─────────────────────────────
  // 🔒 FIX: previously the client only cleared localStorage, leaving the
  // account (and PII) intact on the server. Now it calls this endpoint,
  // which requires password re-confirmation and scrubs PII server-side.
  async deleteMyAccount(password: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/users/me`, {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
  }

  // ─── Admin: Toggle Admin Status ──────────────────────────────────
  async toggleUserAdmin(userId: string) {
    return this.request<any>(`/admin/users/${userId}/toggle-admin`, { method: 'PATCH' });
  }

  // ─── Admin: Toggle User Active/Deactivated ────────────────────────
  async toggleUserActive(userId: string) {
    return this.request<any>(`/admin/users/${userId}/toggle-active`, { method: 'PATCH' });
  }

  // ─── Admin: Adjust User Wallet ────────────────────────────────────
  async adjustUserWallet(userId: string, amount: number, reason: string) {
    return this.request<any>(`/admin/users/${userId}/adjust-wallet`, {
      method: 'POST', body: JSON.stringify({ amount, reason }),
    });
  }

  // ─── Admin: Get Reports ───────────────────────────────────────────
  async getAdminReports() {
    return this.request<any[]>('/admin/reports');
  }

  // ─── Admin: Dismiss Report ────────────────────────────────────────
  async dismissReport(id: string) {
    return this.request<{ message: string }>(`/admin/reports/${id}/dismiss`, { method: 'DELETE' });
  }

  // ─── Admin: Category CRUD ─────────────────────────────────────────
  async addCategory(name: string, icon: string, sort?: number) {
    return this.request<any>('/admin/categories', {
      method: 'POST', body: JSON.stringify({ name, icon, sort }),
    });
  }

  async updateCategory(id: string, data: { name?: string; icon?: string; sort?: number }) {
    return this.request<any>(`/admin/categories/${id}`, {
      method: 'PUT', body: JSON.stringify(data),
    });
  }

  async deleteCategory(id: string) {
    return this.request<{ message: string }>(`/admin/categories/${id}`, { method: 'DELETE' });
  }

  // ─── Admin: Feature/Unfeature Post ────────────────────────────────
  async featurePost(id: string) {
    return this.request<any>(`/admin/posts/${id}/feature`, { method: 'PUT' });
  }

  async unfeaturePost(id: string) {
    return this.request<any>(`/admin/posts/${id}/feature`, { method: 'DELETE' });
  }

  // ─── Admin: Flag Post ─────────────────────────────────────────────
  async flagPost(id: string) {
    return this.request<any>(`/admin/posts/${id}/flag`, { method: 'PATCH' });
  }

  // ─── Admin: News CRUD ─────────────────────────────────────────────
  async addNews(data: { title: string; content: string; source: string; category: string; isAlert?: boolean }) {
    return this.request<any>('/admin/news', {
      method: 'POST', body: JSON.stringify(data),
    });
  }

  async updateNews(id: string, data: { title?: string; content?: string; source?: string; category?: string; isAlert?: boolean }) {
    return this.request<any>(`/admin/news/${id}`, {
      method: 'PUT', body: JSON.stringify(data),
    });
  }

  async deleteNews(id: string) {
    return this.request<{ message: string }>(`/admin/news/${id}`, { method: 'DELETE' });
  }

  // ─── Admin: Settings ──────────────────────────────────────────────
  async getAdminSettings() {
    return this.request<any>('/admin/settings');
  }

  async updateAdminSettings(settings: Record<string, any>) {
    return this.request<any>('/admin/settings', {
      method: 'PUT', body: JSON.stringify(settings),
    });
  }

  // ─── Admin: Detailed Stats ────────────────────────────────────────
  async getAdminDetailedStats() {
    return this.request<any>('/admin/detailed-stats');
  }

  // ─── Market Live ─────────────────────────────────────────────────────
  async getMarketLiveFeed(category?: string, page?: number, limit?: number) {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (page !== undefined) params.set('page', page.toString());
    if (limit !== undefined) params.set('limit', limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ videos: any[]; total: number; page: number; hasMore: boolean }>(`/market/market-live/feed${query}`);
  }

  async marketLiveInteract(videoId: string, interactionType: 'like' | 'save' | 'share' | 'view') {
    return this.request<{ message: string; action: string }>('/market/market-live/interact', {
      method: 'POST', body: JSON.stringify({ videoId, interactionType }),
    });
  }

  // ─── Market Live Video Comments ─────────────────────────────────────
  // These endpoints live under /api/market-live/:videoId/comments (server-side
  // routes/api.ts). They return graceful empty results on failure so the UI
  // can degrade smoothly when the backend doesn't support a given operation
  // (e.g., like/delete endpoints may not exist yet — the call is attempted
  // but the caller wraps it in try/catch).
  async getVideoComments(videoId: string) {
    return this.request<{ comments: any[]; page: number; hasMore: boolean }>(`/market-live/${videoId}/comments`);
  }

  async addVideoComment(videoId: string, text: string, replyToId?: string) {
    return this.request<{ comment: any }>(`/market-live/${videoId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text, replyToId: replyToId || undefined }),
    });
  }

  async deleteVideoComment(commentId: string) {
    return this.request<{ message: string }>(`/market-live/comments/${commentId}`, { method: 'DELETE' });
  }

  async likeVideoComment(commentId: string) {
    return this.request<{ liked: boolean; likes: number }>(`/market-live/comments/${commentId}/like`, { method: 'POST' });
  }

  async uploadVideo(file: File): Promise<{ url: string; filename: string; size: number }> {
    const formData = new FormData();
    formData.append('video', file);

    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch(`${API_BASE}/videos/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Video upload failed' }));
      throw new Error(data.error);
    }

    return res.json();
  }

  async linkVideo(postId: string, videoUrl: string, thumbnailUrl?: string, duration?: number) {
    return this.request<any>('/market-live/link-video', {
      method: 'POST', body: JSON.stringify({ postId, videoUrl, thumbnailUrl, duration }),
    });
  }

  async getMarketLiveStats() {
    return this.request<any>('/market/market-live/stats');
  }

  async getMyVideos() {
    return this.request<any[]>('/market-live/my-videos');
  }

  // ─── NEW: Get any user's videos (for UserVideosPage grid) ──────────
  async getUserVideos(userId: string) {
    return this.request<{ videos: any[]; total: number }>(`/market-live/user-videos/${userId}`);
  }

  // ─── Share Tracking ────────────────────────────────────────────────
  // NOTE: trackShare is also defined above (line ~465) with skipAuthExpired=true.
  // This duplicate is removed to avoid the TS2393 error. If you need to call
  // trackShare, use the one defined earlier in this class.
  async getShareStats(postId: string) {
    return this.request<{ total: number; byPlatform: Record<string, number>; recentShares: any[] }>(`/posts/${postId}/share-stats`);
  }

  // ─── Smart Link Enhanced ───────────────────────────────────────────
  async generateSmartLink(postId: string, alias: string) {
    return this.request<{ url: string; alias: string }>(`/smart-link/generate`, {
      method: 'POST', body: JSON.stringify({ postId, alias }),
    });
  }

  async getSmartLinkStats(postId: string) {
    return this.request<{ totalVisits: number; uniqueVisitors: number; visitsByDate: any[]; recentVisitors: any[] }>(`/smart-link/${postId}/stats`);
  }

  // ─── Admin: Transactions ──────────────────────────────────────────
  async getAdminTransactions(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<{ transactions: any[]; total: number; page: number; totalPages: number }>(`/admin/transactions${query}`);
  }

  // ─── Admin: Stories ───────────────────────────────────────────────
  async getAdminStories() {
    return this.request<any[]>('/admin/stories');
  }

  async deleteAdminStory(id: string) {
    return this.request<{ message: string }>(`/admin/stories/${id}`, { method: 'DELETE' });
  }

  // ─── Admin: Chat Messages ─────────────────────────────────────────
  async getAdminChatMessages(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>(`/admin/chat-messages${query}`);
  }

  async deleteAdminChatMessage(id: string) {
    return this.request<{ message: string }>(`/admin/chat-messages/${id}`, { method: 'DELETE' });
  }

  // ─── Admin: Activity Log ──────────────────────────────────────────
  async getAdminActivityLog(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>(`/admin/activity-log${query}`);
  }

  // ─── Admin: Database Info ─────────────────────────────────────────
  async getAdminDatabaseInfo() {
    return this.request<{ tables: Record<string, number>; totalTables: number; dbSize: number; dbSizeFormatted: string }>('/admin/database-info');
  }

  // ─── Admin: Broadcast ─────────────────────────────────────────────
  async adminBroadcast(data: { title: string; message: string; type: string }) {
    return this.request<{ count: number }>('/admin/broadcast', {
      method: 'POST', body: JSON.stringify(data),
    });
  }

  // ─── Admin: Cleanup ───────────────────────────────────────────────
  async adminCleanup(action: string) {
    return this.request<{ message: string; deletedCount?: number }>('/admin/cleanup', {
      method: 'POST', body: JSON.stringify({ action }),
    });
  }

  // ─── Admin: User Details ──────────────────────────────────────────
  async getAdminUserDetails(userId: string) {
    return this.request<any>(`/admin/user-details/${userId}`);
  }

  // ─── Admin: Report Action ─────────────────────────────────────────
  async adminReportAction(reportId: string, action: string) {
    return this.request<{ message: string }>(`/admin/reports/${reportId}/action`, {
      method: 'POST', body: JSON.stringify({ action }),
    });
  }

  // ─── Admin: Smart Links Overview ──────────────────────────────────
  async getAdminSmartLinks() {
    return this.request<{ totalLinks: number; totalVisits: number; uniqueVisitors: number; topLinks: any[]; visitsByDate: any[] }>('/admin/smart-links');
  }

  // ─── Admin: Comments ──────────────────────────────────────────────
  async getAdminComments(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<any[]>(`/admin/comments${query}`);
  }

  async deleteAdminComment(id: string) {
    return this.request<{ message: string }>(`/admin/comments/${id}`, { method: 'DELETE' });
  }

  // ─── Admin: Toggle Trusted ────────────────────────────────────────
  async toggleUserTrusted(userId: string) {
    return this.request<{ id: string; is_trusted: boolean; message: string }>(`/admin/users/${userId}/toggle-trusted`, { method: 'PATCH' });
  }

  // ─── Admin: Send Warning ──────────────────────────────────────────
  async sendUserWarning(userId: string, reason: string) {
    return this.request<{ message: string }>(`/admin/users/${userId}/send-warning`, {
      method: 'POST', body: JSON.stringify({ reason }),
    });
  }

  // ─── Admin: Realtime Stats ────────────────────────────────────────
  async getAdminRealtimeStats() {
    return this.request<{ onlineUsers: number; newPostsToday: number; newUsersToday: number; pendingItems: number; recentActivity: any[] }>('/admin/dashboard/realtime');
  }

  // ─── Smart Market ──────────────────────────────────────────────────
  async getMarketListings(params?: Record<string, string>) {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.request<{ listings: any[]; total: number; page: number; categories: any[] }>(`/market/listings${query}`);
  }

  async getMarketListing(id: string) {
    return this.request<any>(`/market/listings/${id}`);
  }

  async createMarketListing(data: any) {
    return this.request<any>('/market/listings', {
      method: 'POST', body: JSON.stringify(data),
    });
  }

  async updateMarketListing(id: string, data: any) {
    return this.request<any>(`/market/listings/${id}`, {
      method: 'PUT', body: JSON.stringify(data),
    });
  }

  async deleteMarketListing(id: string) {
    return this.request<{ message: string }>(`/market/listings/${id}`, { method: 'DELETE' });
  }

  async toggleSaveMarketListing(id: string) {
    return this.request<{ saved: boolean; savesCount: number }>(`/market/listings/${id}/save`, { method: 'POST' });
  }

  async getSavedMarketListings() {
    return this.request<any[]>('/market/saved');
  }

  async getMyMarketListings() {
    return this.request<any[]>('/market/my-listings');
  }

  async inquireMarketListing(id: string) {
    return this.request<{ inquiriesCount: number }>(`/market/listings/${id}/inquire`, { method: 'POST' });
  }

  async requestMarketPromotion(data: any) {
    return this.request<any>('/market/promote', {
      method: 'POST', body: JSON.stringify(data),
    });
  }

  async getMyMarketPromotions() {
    return this.request<any[]>('/market/my-promotions');
  }

  async getMarketStats() {
    return this.request<{ totalListings: number; totalSellers: number; averagePrice: number; newToday: number; categoryBreakdown: any[] }>('/market/stats');
  }

  async getMarketCategories() {
    return this.request<any[]>('/market/categories');
  }

  // ─── Business Page: Follow + Portfolio ────────────────────────────
  async followUser(userId: string) {
    return this.request<{ following: boolean }>(`/users/${userId}/follow`, { method: 'POST' });
  }
  async unfollowUser(userId: string) {
    return this.request<{ following: boolean }>(`/users/${userId}/follow`, { method: 'DELETE' });
  }
  async getFollowStatus(userId: string) {
    return this.request<{ following: boolean; followersCount: number; followingCount: number }>(`/users/${userId}/follow-status`);
  }
  async getPortfolio(userId: string) {
    return this.request<string[]>(`/users/${userId}/portfolio`);
  }
  async addPortfolioImage(image: string) {
    return this.request<{ images: string[] }>('/users/portfolio', { method: 'POST', body: JSON.stringify({ image }) });
  }
  async removePortfolioImage(index: number) {
    return this.request<{ images: string[] }>(`/users/portfolio/${index}`, { method: 'DELETE' });
  }

  // ─── User: Market Listing Status Control ──────────────────────────
  async updateMarketListingStatus(id: string, status: 'active' | 'paused' | 'sold' | 'deleted') {
    return this.request<any>(`/market/listings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  }

  // ─── Admin: Market Listings Management ────────────────────────────
  async getAdminMarketListings(status?: string, search?: string) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<any[]>(`/admin/market-listings${query}`);
  }

  async deleteAdminMarketListing(id: string) {
    return this.request<{ message: string }>(`/admin/market-listings/${id}`, { method: 'DELETE' });
  }

  async toggleAdminMarketListingFeature(id: string) {
    return this.request<{ message: string; is_featured: boolean }>(`/admin/market-listings/${id}/feature`, { method: 'POST' });
  }

  // ─── Admin: Market Promotion Requests ─────────────────────────────
  async getMarketPromotionRequests(status?: string) {
    const query = status ? `?status=${status}` : '';
    return this.request<any[]>(`/admin/market-promotion-requests${query}`);
  }

  async approveMarketPromotion(id: string) {
    return this.request<{ message: string }>(`/admin/market-promotion-requests/${id}/approve`, { method: 'POST' });
  }

  async rejectMarketPromotion(id: string) {
    return this.request<{ message: string }>(`/admin/market-promotion-requests/${id}/reject`, { method: 'POST' });
  }

  // ─── AI Promotion Intelligence ────────────────────────────────────
  async aiAutoTarget(data: { postId?: string; content?: string; category?: string; price?: number; location?: string }) {
    return this.request<{ success: boolean; data: any }>('/ai/auto-target', {
      method: 'POST', body: JSON.stringify(data),
    });
  }

  async aiReviewPromotion(data: { postId?: string; content?: string; category?: string; price?: number }) {
    return this.request<{ success: boolean; data: any }>('/ai/review-promotion', {
      method: 'POST', body: JSON.stringify(data),
    });
  }

  async aiAssistant(message: string, userId?: string, history?: Array<{ role: 'user' | 'assistant'; content: string }>) {
    return this.request<{ success: boolean; reply: string; fallback?: boolean }>('/ai/assistant', {
      method: 'POST', body: JSON.stringify({ message, userId, history }),
    });
  }

  async aiBudgetSuggestion(data: { budget?: number; category?: string; price?: number; goal?: string }) {
    return this.request<{ success: boolean; data: any }>('/ai/budget-suggestion', {
      method: 'POST', body: JSON.stringify(data),
    });
  }

  async aiInsights() {
    return this.request<{ success: boolean; data: any }>('/ai/insights');
  }

  async aiEnhanceContent(data: { content: string; category?: string; price?: number }) {
    return this.request<{ success: boolean; data: any }>('/ai/enhance-content', {
      method: 'POST', body: JSON.stringify(data),
    });
  }

  async aiAnalyzeMyPosts() {
    return this.request<{ success: boolean; data: any }>('/ai/analyze-my-posts', {
      method: 'POST', body: JSON.stringify({}),
    });
  }

  // ─── AI Smart Placement ─────────────────────────────────────────────
  async aiSmartPlacement(data: {
    promotedPosts: any[];
    totalPosts: number;
    feedType: 'home' | 'market' | 'matches';
    userInterests?: string[];
  }) {
    return this.request<{
      success: boolean;
      positions: { postIndex: number; feedPosition: number; reason: string }[];
      strategy: string;
      peakPositions: number[];
      avoidPositions: number[];
      reasoning: string;
      confidence: number;
      fromCache?: boolean;
    }>('/ai/smart-placement', {
      method: 'POST', body: JSON.stringify(data),
    });
  }

  // ─── AI Engagement Tracking ─────────────────────────────────────────
  async aiTrackEngagement(events: {
    postId: string;
    feedPosition: number;
    feedType: 'home' | 'market' | 'matches';
    action: 'impression' | 'click' | 'view' | 'scroll_past';
    timeOnScreen?: number;
    scrollDepth?: number;
  }[]) {
    return this.request<{ tracked: number }>('/ai/track-engagement', {
      method: 'POST', body: JSON.stringify({ events }),
    });
  }

  // ─── AI Placement Analytics ─────────────────────────────────────────
  async aiPlacementAnalytics(feedType?: string, days?: number) {
    const params = new URLSearchParams();
    if (feedType) params.set('feedType', feedType);
    if (days !== undefined) params.set('days', days.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ success: boolean; data: any }>(`/ai/placement-analytics${query}`);
  }

  // ─── Phase 3: Story Interactions ─────────────────────────────────
  async viewStory(storyId: string) { return this.request<{ success: boolean }>(`/stories/${storyId}/view`, { method: 'POST' }); }
  async replyToStory(storyId: string, text: string) { return this.request<{ success: boolean; id: string }>(`/stories/${storyId}/reply`, { method: 'POST', body: JSON.stringify({ text }) }); }
  async reactToStory(storyId: string, emoji: string) { return this.request<{ success: boolean; reacted: boolean }>(`/stories/${storyId}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }); }
  async getStoryViewers(storyId: string) { return this.request<any[]>(`/stories/${storyId}/viewers`); }
  async deleteExpiredStories() { return this.request<{ success: boolean; deleted: number }>('/stories/expired', { method: 'DELETE' }); }
  async getUserHighlights(userId: string) { return this.request<any[]>(`/users/${userId}/highlights`); }
  async createHighlight(name: string, storyIds: string[]) { return this.request<{ success: boolean; id: string }>('/highlights', { method: 'POST', body: JSON.stringify({ name, storyIds }) }); }

  // ─── Phase 3: Wallet Withdrawal ─────────────────────────────────
  // External withdrawal — sends money OUTSIDE the platform to a chosen
  // payout network (Vodafone Cash, InstaPay, Fawry, Etisalat Cash,
  // Orange Cash, Bank Transfer). A 5% platform fee is deducted from
  // the requested amount; the user's external account receives the
  // `net` amount. The request is HELD (deducted from wallet_balance
  // immediately) and an admin must approve or reject it.
  async requestExternalWithdrawal(amount: number, network: string, accountNumber: string) {
    return this.request<{
      message: string; withdrawalId: string;
      amount: number; fee: number; net: number;
      network: string; accountNumber: string;
    }>('/wallet/withdraw', {
      method: 'POST', body: JSON.stringify({ amount, network, accountNumber }),
    });
  }

  // Current user's own withdrawal history (for the Withdraw tab history list).
  async getWithdrawalRequests() {
    return this.request<any[]>('/wallet/withdraw-requests');
  }

  // Legacy stub — kept for backward compatibility. The actual external
  // withdrawal now goes through `requestExternalWithdrawal` above.
  async requestWithdrawal(amount: number, method: string, accountDetails?: string) {
    return this.requestExternalWithdrawal(amount, method, accountDetails || '');
  }

  async getWithdrawals() { return this.request<any[]>('/wallet/withdrawals'); }
  async processWithdrawal(id: string, action: 'approve' | 'reject', adminNote?: string) {
    return this.request<{ success: boolean; action: string }>(`/wallet/withdrawals/${id}/${action}`, {
      method: 'POST', body: JSON.stringify({ adminNote }),
    });
  }

  // ─── Admin: Withdrawal & Charge Requests (new approval panel) ────
  // GET /api/admin/withdrawal-requests — all withdrawal requests (newest first)
  async getAdminWithdrawalRequests(status?: 'pending' | 'approved' | 'rejected') {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<any[]>(`/admin/withdrawal-requests${query}`);
  }
  async approveAdminWithdrawal(id: string, adminNote?: string) {
    return this.request<{ success: boolean; message: string }>(`/admin/withdrawal-requests/${id}/approve`, {
      method: 'POST', body: JSON.stringify({ adminNote }),
    });
  }
  async rejectAdminWithdrawal(id: string, adminNote?: string) {
    return this.request<{ success: boolean; message: string }>(`/admin/withdrawal-requests/${id}/reject`, {
      method: 'POST', body: JSON.stringify({ adminNote }),
    });
  }
  // Charge request admin endpoints (aliases for the wallet/admin/charging-requests/* ones)
  async getAdminChargeRequests(status?: 'pending' | 'approved' | 'rejected') {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<any[]>(`/admin/charge-requests${query}`);
  }
  async approveAdminCharge(id: string) {
    return this.request<{ success: boolean; message: string }>(`/admin/charge-requests/${id}/approve`, { method: 'POST' });
  }
  async rejectAdminCharge(id: string) {
    return this.request<{ success: boolean; message: string }>(`/admin/charge-requests/${id}/reject`, { method: 'POST' });
  }

  // ─── Wallet-to-Wallet Transfers (pending acceptance flow) ────────
  // Sender initiates a transfer; money is HELD until the recipient
  // accepts (or refunded if they reject).
  async walletTransfer(recipientId: string, amount: number, note?: string) {
    return this.request<{ message: string; transferId: string; amount: number; recipientName: string }>(
      '/wallet/transfer',
      { method: 'POST', body: JSON.stringify({ recipientId, amount, note }) },
    );
  }
  async acceptTransfer(transferId: string) {
    return this.request<{ message: string; amount: number }>(`/wallet/transfer/${transferId}/accept`, { method: 'POST' });
  }
  async rejectTransfer(transferId: string) {
    return this.request<{ message: string; amount: number }>(`/wallet/transfer/${transferId}/reject`, { method: 'POST' });
  }

  // ─── Gift Balance ────────────────────────────────────────────────
  // GET /api/wallet/gifts — returns { giftBalance, totalReceived, history }
  async getWalletGifts() {
    return this.request<{ giftBalance: number; totalReceived: number; history: any[] }>('/wallet/gifts');
  }
  // POST /api/wallet/withdraw-gifts — converts gift_balance to
  // wallet_balance with a 10% platform fee. Body `amount` optional —
  // omit to withdraw everything.
  async withdrawGifts(amount?: number) {
    return this.request<{ message: string; amount: number; fee: number; net: number; newGiftBalance: number }>(
      '/wallet/withdraw-gifts',
      { method: 'POST', body: JSON.stringify(amount != null ? { amount } : {}) },
    );
  }

  // ─── Market Live: send a gift to a video creator ─────────────────
  // POST /api/market-live/videos/:videoId/gift
  // Deducts from sender wallet, adds to recipient's gift_balance
  // (separate from wallet_balance). Returns gift + new wallet balance.
  async sendMarketLiveGift(videoId: string, data: { giftType: string; amount: number; message?: string }) {
    return this.request<{ success: boolean; gift: { type: string; name: string; icon: string; amount: number; message: string }; newBalance: number; giftBalance: number }>(
      `/market-live/videos/${videoId}/gift`,
      { method: 'POST', body: JSON.stringify(data) },
    );
  }

  // ─── Savings Goals ────────────────────────────────────────────────
  async getSavingsGoals() {
    return this.request<any[]>('/wallet/savings-goals');
  }
  async createSavingsGoal(name: string, target: number, deadline?: string) {
    return this.request<any>('/wallet/savings-goals', {
      method: 'POST', body: JSON.stringify({ name, target, deadline }),
    });
  }
  async updateSavingsGoal(id: string, data: { name?: string; target?: number; current?: number; deadline?: string }) {
    return this.request<any>(`/wallet/savings-goals/${id}`, {
      method: 'PUT', body: JSON.stringify(data),
    });
  }
  async deleteSavingsGoal(id: string) {
    return this.request<{ success: boolean }>(`/wallet/savings-goals/${id}`, {
      method: 'DELETE',
    });
  }
  async addToSavingsGoal(id: string, amount: number) {
    return this.request<any>(`/wallet/savings-goals/${id}/add`, {
      method: 'POST', body: JSON.stringify({ amount }),
    });
  }
  async withdrawFromSavingsGoal(id: string, amount: number) {
    return this.request<any>(`/wallet/savings-goals/${id}/withdraw`, {
      method: 'POST', body: JSON.stringify({ amount }),
    });
  }

  // ─── Phase 3: Push Notifications ─────────────────────────────────
  async registerDevice(token: string, platform: string) {
    return this.request<{ success: boolean; registered: boolean }>('/notifications/register-device', {
      method: 'POST', body: JSON.stringify({ token, platform }),
    });
  }
  async sendNotification(userId: string, title: string, body: string, data?: Record<string, string>) {
    return this.request<{ success: boolean; sent: number }>('/notifications/send', {
      method: 'POST', body: JSON.stringify({ userId, title, body, data }),
    });
  }
  async broadcastNotification(title: string, body: string, data?: Record<string, string>) {
    return this.request<{ success: boolean; broadcast: boolean; totalUsers: number; sent: number }>('/notifications/send', {
      method: 'POST', body: JSON.stringify({ userId: 'all', title, body, data }),
    });
  }
  async sendNotificationToUsers(userIds: string[], title: string, body: string, data?: Record<string, string>) {
    return this.request<{ success: boolean; sent: number }>('/notifications/send', {
      method: 'POST', body: JSON.stringify({ userIds, title, body, data }),
    });
  }
  async sendNotificationToTopic(topic: string, title: string, body: string, data?: Record<string, string>) {
    return this.request<{ success: boolean; sent: number }>('/notifications/send', {
      method: 'POST', body: JSON.stringify({ topic, title, body, data }),
    });
  }
  async getFCMStatus() {
    return this.request<{ available: boolean; appName: string | null; projectId: string | null; registeredDevices: number }>('/notifications/fcm-status');
  }

  // ─── Phase 3: Report User ──────────────────────────────────────
  async reportUser(targetUserId: string, reason: string, details?: string) {
    return this.request<{ success: boolean; id: string }>('/report', {
      method: 'POST', body: JSON.stringify({ targetUserId, reason, details }),
    });
  }

  // ─── Phase 3+: Email Verification ─────────────────────────────────
  async sendEmailVerification() {
    return this.request<{ message: string; code?: string }>('/auth/send-verification', { method: 'POST' });
  }
  async verifyEmail(email: string, code: string) {
    return this.request<{ message: string; user: any; token: string }>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ email, code }) });
  }

  // ─── Phase 3+: Scheduled Streams ─────────────────────────────────
  async getScheduledStreams() { return this.request<any[]>('/livestream/scheduled'); }
  async scheduleStream(data: { title: string; description?: string; scheduledAt: string; durationMinutes?: number; category?: string }) {
    return this.request<{ success: boolean; id: string }>('/livestream/schedule', { method: 'POST', body: JSON.stringify(data) });
  }
  async setStreamReminder(streamId: string) {
    return this.request<{ success: boolean }>(`/livestream/schedule/${streamId}/remind`, { method: 'POST' });
  }
  async cancelScheduledStream(streamId: string) {
    return this.request<{ success: boolean }>(`/livestream/schedule/${streamId}`, { method: 'DELETE' });
  }

  // ─── Phase 3+: Stream Gifts ───────────────────────────────────────
  async getGiftTypes() { return this.request<any[]>('/livestream/gifts'); }
  async sendStreamGift(data: { streamId: string; receiverId: string; giftType: string; message?: string }) {
    return this.request<{ success: boolean; id: string; amount: number; giftName: string }>('/livestream/gift', { method: 'POST', body: JSON.stringify(data) });
  }
  async getStreamGifts(streamId: string) { return this.request<any[]>(`/livestream/${streamId}/gifts`); }
  async getStreamGiftStats(streamId: string) { return this.request<{ stats: any[]; total: number }>(`/livestream/${streamId}/gift-stats`); }

  // ─── Channels ──────────────────────────────────────────────────────
  // Telegram-like broadcast channels: one-to-many publishing with
  // subscribers, posts, reactions, comments, views.
  async listChannels(opts?: { limit?: number; offset?: number; category?: string; sort?: 'trending' | 'new' }) {
    const q = new URLSearchParams();
    if (opts?.limit) q.set('limit', String(opts.limit));
    if (opts?.offset) q.set('offset', String(opts.offset));
    if (opts?.category) q.set('category', opts.category);
    if (opts?.sort) q.set('sort', opts.sort);
    return this.request<any[]>(`/channels?${q.toString()}`);
  }
  async searchChannels(q: string) {
    return this.request<any[]>(`/channels/search?q=${encodeURIComponent(q)}`);
  }
  async getMyChannels() {
    return this.request<any[]>(`/channels/mine`);
  }
  async getSubscribedChannels() {
    return this.request<any[]>(`/channels/subscribed`);
  }
  async getChannel(idOrHandle: string) {
    return this.request<any>(`/channels/${idOrHandle}`);
  }
  async createChannel(data: { name: string; description?: string; handle?: string; is_public?: boolean; allow_comments?: boolean; allow_reactions?: boolean; category?: string }, avatar?: File, cover?: File) {
    const formData = new FormData();
    Object.entries(data).forEach(([k, v]) => {
      if (v !== undefined && v !== null) formData.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    });
    if (avatar) formData.append('avatar', avatar);
    if (cover) formData.append('cover', cover);
    return this.request<any>(`/channels`, { method: 'POST', body: formData });
  }
  async updateChannel(id: string, data: any, avatar?: File, cover?: File) {
    const formData = new FormData();
    Object.entries(data).forEach(([k, v]) => {
      if (v !== undefined && v !== null) formData.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    });
    if (avatar) formData.append('avatar', avatar);
    if (cover) formData.append('cover', cover);
    return this.request<any>(`/channels/${id}`, { method: 'PATCH', body: formData });
  }
  async deleteChannel(id: string) {
    return this.request<{ success: boolean }>(`/channels/${id}`, { method: 'DELETE' });
  }
  async subscribeToChannel(id: string) {
    return this.request<{ success: boolean; subscribed?: boolean }>(`/channels/${id}/subscribe`, { method: 'POST' });
  }
  async unsubscribeFromChannel(id: string) {
    return this.request<{ success: boolean; unsubscribed?: boolean }>(`/channels/${id}/subscribe`, { method: 'DELETE' });
  }

  // ─── Channel subscriber settings (per-user preferences) ───────────
  // Used by the ChannelSettingsModal. Updates the caller's per-channel
  // preferences: notification level, mute duration, auto-load media.
  async updateChannelSubscriberSettings(channelId: string, settings: {
    notification_level?: 'all' | 'live_only' | 'important' | 'none';
    muted_until?: string | null;   // ISO timestamp or null to unmute
    auto_load_media?: boolean;
  }) {
    return this.request<{ success: boolean; notification_level: string; muted_until: string | null; auto_load_media: boolean }>(
      `/channels/${channelId}/subscriber-settings`,
      { method: 'PATCH', body: JSON.stringify(settings) }
    );
  }

  // Block a channel (won't appear in suggestions/search). Also unsubscribes.
  async blockChannel(channelId: string) {
    return this.request<{ success: boolean }>(`/channels/${channelId}/block`, { method: 'POST' });
  }
  async unblockChannel(channelId: string) {
    return this.request<{ success: boolean }>(`/channels/${channelId}/block`, { method: 'DELETE' });
  }

  // Report a channel (spam/abuse/scam/copyright/illegal/other). One report
  // per user per channel (enforced by UNIQUE constraint on the backend).
  async reportChannel(channelId: string, reason: string, details?: string) {
    return this.request<{ success: boolean; message: string }>(
      `/channels/${channelId}/report`,
      { method: 'POST', body: JSON.stringify({ reason, details }) }
    );
  }
  async getChannelPosts(channelId: string, opts?: { limit?: number; offset?: number }) {
    const q = new URLSearchParams();
    if (opts?.limit) q.set('limit', String(opts.limit));
    if (opts?.offset) q.set('offset', String(opts.offset));
    return this.request<any[]>(`/channels/${channelId}/posts?${q.toString()}`);
  }
  async createChannelPost(channelId: string, data: { content?: string; media_caption?: string; link_url?: string; link_title?: string; link_description?: string; link_image?: string }, media?: File) {
    const formData = new FormData();
    Object.entries(data).forEach(([k, v]) => {
      if (v !== undefined && v !== null) formData.append(k, String(v));
    });
    if (media) formData.append('media', media);
    return this.request<any>(`/channels/${channelId}/posts`, { method: 'POST', body: formData });
  }
  async deleteChannelPost(postId: string) {
    return this.request<{ success: boolean }>(`/channels/posts/${postId}`, { method: 'DELETE' });
  }
  async viewChannelPost(postId: string) {
    return this.request<{ success: boolean }>(`/channels/posts/${postId}/view`, { method: 'POST' });
  }
  async reactToChannelPost(postId: string, emoji: string) {
    return this.request<{ success: boolean; action: string }>(`/channels/posts/${postId}/react`, { method: 'POST', body: JSON.stringify({ emoji }) });
  }
  async getChannelPostComments(postId: string) {
    return this.request<any[]>(`/channels/posts/${postId}/comments`);
  }
  async addChannelPostComment(postId: string, content: string, parentId?: string) {
    return this.request<any>(`/channels/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ content, parent_id: parentId }) });
  }
  async pinChannelPost(postId: string) {
    return this.request<{ success: boolean; is_pinned: boolean }>(`/channels/posts/${postId}/pin`, { method: 'POST' });
  }

  // ─── Chat V2: Disappearing + Scheduled + AI ───────────────────────
  async getConversationSettings(otherUserId: string) {
    return this.request<any>(`/chat/conversation/${otherUserId}/settings`);
  }
  async updateConversationSettings(otherUserId: string, settings: { disappearing_ttl?: number; muted?: boolean; pinned?: boolean }) {
    return this.request<{ success: boolean }>(`/chat/conversation/${otherUserId}/settings`, { method: 'PATCH', body: JSON.stringify(settings) });
  }
  async scheduleMessage(data: { receiverId?: string; text: string; scheduledAt: string; groupId?: string }) {
    return this.request<any>(`/chat/schedule`, { method: 'POST', body: JSON.stringify(data) });
  }
  async getScheduledMessages() {
    return this.request<any[]>(`/chat/scheduled`);
  }
  async cancelScheduledMessage(id: string) {
    return this.request<{ success: boolean }>(`/chat/scheduled/${id}`, { method: 'DELETE' });
  }
  async getSmartReplies(lastMessages: { text: string; isMine: boolean }[]) {
    return this.request<{ replies: string[] }>(`/chat/smart-reply`, { method: 'POST', body: JSON.stringify({ lastMessages }) });
  }
  async searchUsersByPhone(phone: string) {
    return this.request<any[]>(`/chat/search-users-by-phone?phone=${encodeURIComponent(phone)}`);
  }

  // ─── Chat V3: AI + Payments + Translation ─────────────────────────
  async aiSummarize(messages: any[], otherUserName?: string) {
    return this.request<{ summary: string }>(`/chat/ai/summarize`, { method: 'POST', body: JSON.stringify({ messages, otherUserName }) });
  }
  async createReminder(title: string, remindAt: string, conversationId?: string) {
    return this.request<{ id: string; success: boolean }>(`/chat/ai/remind`, { method: 'POST', body: JSON.stringify({ title, remindAt, conversationId }) });
  }
  async getReminders() {
    return this.request<any[]>(`/chat/ai/reminders`);
  }
  async cancelReminder(id: string) {
    return this.request<{ success: boolean }>(`/chat/ai/reminders/${id}`, { method: 'DELETE' });
  }
  async translateMessage(messageId: string, text: string, targetLang?: string) {
    return this.request<{ translated: string }>(`/chat/ai/translate`, { method: 'POST', body: JSON.stringify({ messageId, text, targetLang }) });
  }
  async detectSpam(text: string) {
    return this.request<{ isSpam: boolean; risk: number }>(`/chat/ai/detect-spam`, { method: 'POST', body: JSON.stringify({ text }) });
  }
  async sendChatPayment(receiverId: string, amount: number, note?: string) {
    return this.request<{ success: boolean; paymentId: string; messageId: string; newBalance: number }>(`/chat/payment/send`, { method: 'POST', body: JSON.stringify({ receiverId, amount, note }) });
  }
  async requestChatPayment(receiverId: string, amount: number, note?: string) {
    return this.request<{ success: boolean; paymentId: string; messageId: string }>(`/chat/payment/request`, { method: 'POST', body: JSON.stringify({ receiverId, amount, note }) });
  }
  async acceptChatPayment(paymentId: string) {
    return this.request<{ success: boolean }>(`/chat/payment/${paymentId}/accept`, { method: 'POST' });
  }
  async rejectChatPayment(paymentId: string) {
    return this.request<{ success: boolean }>(`/chat/payment/${paymentId}/reject`, { method: 'POST' });
  }

  // ─── Channel Live Streams ─────────────────────────────────────────
  async startChannelLive(channelId: string, title?: string) {
    return this.request<any>(`/channels/${channelId}/live/start`, { method: 'POST', body: JSON.stringify({ title }) });
  }
  async endChannelLive(channelId: string, recordingUrl?: string, recordingDuration?: number) {
    return this.request<{ success: boolean }>(`/channels/${channelId}/live/end`, {
      method: 'POST',
      body: JSON.stringify({ recording_url: recordingUrl, recording_duration: recordingDuration }),
    });
  }

  /**
   * Attach a recording URL to an ALREADY-ENDED channel live stream.
   * Used by the background-upload flow: the stream ends immediately
   * (no recording URL), the host closes the panel, the upload runs in
   * the background, and when it completes we call this endpoint to
   * save the URL + create a replay channel post.
   */
  async attachChannelLiveRecording(channelId: string, streamId: string, recordingUrl: string, recordingDuration: number) {
    return this.request<{ success: boolean }>(
      `/channels/${channelId}/live/${streamId}/recording`,
      {
        method: 'POST',
        body: JSON.stringify({ recording_url: recordingUrl, recording_duration: recordingDuration }),
      }
    );
  }
  async getCurrentChannelLive(channelId: string) {
    return this.request<any>(`/channels/${channelId}/live/current`);
  }
  async joinChannelLiveViewer(channelId: string) {
    return this.request<{ success: boolean }>(`/channels/${channelId}/live/viewer-join`, { method: 'POST' });
  }
  async leaveChannelLiveViewer(channelId: string) {
    return this.request<{ success: boolean }>(`/channels/${channelId}/live/viewer-leave`, { method: 'POST' });
  }
  async sendChannelLiveChat(channelId: string, content: string) {
    return this.request<any>(`/channels/${channelId}/live/chat`, { method: 'POST', body: JSON.stringify({ content }) });
  }
  async getChannelLiveChat(channelId: string) {
    return this.request<any[]>(`/channels/${channelId}/live/chat`);
  }

  // ─── Channel Integrations: Stories + Promotions + AI cross-post + Wallet ──
  async createChannelStory(channelId: string, data: { text?: string }, media?: File) {
    const formData = new FormData();
    if (data.text) formData.append('text', data.text);
    if (media) formData.append('media', media);
    return this.request<any>(`/channels/${channelId}/story`, { method: 'POST', body: formData });
  }
  async promoteChannel(channelId: string, data: { budget: number; tier?: string }) {
    return this.request<any>(`/channels/${channelId}/promote`, { method: 'POST', body: JSON.stringify(data) });
  }
  async getChannelCrossPostSuggestions(channelId: string) {
    return this.request<{ suggestions: any[] }>(`/channels/${channelId}/cross-post`);
  }
  async publishChannelCrossPost(channelId: string, content: string) {
    return this.request<any>(`/channels/${channelId}/cross-post`, { method: 'POST', body: JSON.stringify({ content }) });
  }
  async getChannelWalletTransactions(channelId: string) {
    return this.request<any[]>(`/channels/${channelId}/wallet-transactions`);
  }

  // ─── Channel V2: Gifts + Scheduled + Polls + Analytics ────────────
  async getGiftCatalog() { return this.request<any[]>('/channels/gifts/catalog'); }
  async sendChannelGift(channelId: string, giftType: string, message?: string) {
    return this.request<any>(`/channels/${channelId}/live/gift`, { method: 'POST', body: JSON.stringify({ giftType, message }) });
  }
  async getChannelLiveGifts(channelId: string) { return this.request<any[]>(`/channels/${channelId}/live/gifts`); }
  async scheduleChannelStream(channelId: string, data: { title: string; description?: string; scheduledAt: string }) {
    return this.request<any>(`/channels/${channelId}/schedule-stream`, { method: 'POST', body: JSON.stringify(data) });
  }
  async getScheduledChannelStreams(channelId: string) { return this.request<any[]>(`/channels/${channelId}/scheduled-streams`); }
  async createLivePoll(channelId: string, question: string, options: string[]) {
    return this.request<any>(`/channels/${channelId}/live/poll`, { method: 'POST', body: JSON.stringify({ question, options }) });
  }
  async voteLivePoll(pollId: string, optionId: string) {
    return this.request<{ success: boolean }>(`/channels/live/polls/${pollId}/vote`, { method: 'POST', body: JSON.stringify({ optionId }) });
  }
  async closeLivePoll(pollId: string) {
    return this.request<{ success: boolean }>(`/channels/live/polls/${pollId}/close`, { method: 'POST' });
  }
  async getLivePolls(channelId: string) { return this.request<any[]>(`/channels/${channelId}/live/polls`); }
  async getChannelAnalytics(channelId: string) { return this.request<any>(`/channels/${channelId}/analytics`); }

  // ─── Personal Section Enhancements ────────────────────────────────
  // Portfolio: upload an image file directly. The backend accepts a JSON
  // body with a `image` field (data URL). We convert the File to a data URL
  // on the client side (FileReader) so the request uses application/json
  // and we don't need multer on the server.
  // 🔧 FIX: previously sent as multipart FormData, but the server didn't
  // have multer wired up for /users/portfolio/upload — so the upload
  // silently failed and the frontend fell back to a slower path. Now
  // both sides speak JSON.
  async uploadPortfolioImage(file: File): Promise<{ images: string[]; url: string }> {
    // Read file as data URL
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('فشل قراءة الملف'));
      reader.readAsDataURL(file);
    });
    return this.request<{ images: string[]; url: string }>('/users/portfolio/upload', {
      method: 'POST',
      body: JSON.stringify({ image: dataUrl }),
    });
  }

  // Notification preferences (granular per-category toggles + sound)
  async updateNotificationPreferences(prefs: Record<string, any>) {
    return this.request<{ success: boolean }>('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    });
  }

  async getNotificationPreferences() {
    return this.request<Record<string, any>>('/notifications/preferences');
  }

  // Account: change password (current → new)
  // 🔧 FIX: backend uses PUT (not POST) — the v3 SettingsPage was POSTing
  // to a route that didn't exist, so changing password silently failed.
  async changeMyPassword(currentPassword: string, newPassword: string) {
    return this.request<{ message: string }>('/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  // Security: active sessions, login history, connected devices
  async getActiveSessions() {
    return this.request<any[]>('/auth/sessions');
  }

  async revokeSession(sessionId: string) {
    return this.request<{ message: string }>(`/auth/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  }

  async getLoginHistory() {
    return this.request<any[]>('/auth/login-history');
  }

  async getConnectedDevices() {
    return this.request<any[]>('/auth/devices');
  }

  // Two-factor authentication toggle (returns QR/url for setup if enabling)
  async toggle2FA(enable: boolean, code?: string) {
    return this.request<{ enabled: boolean; qrUrl?: string; secret?: string }>('/auth/2fa', {
      method: 'POST',
      body: JSON.stringify({ enable, code }),
    });
  }

  async get2FAStatus() {
    return this.request<{ enabled: boolean }>('/auth/2fa/status');
  }

  // Activity timeline for the current user (used by MyPage dashboard)
  async getMyActivity(limit?: number) {
    const q = limit ? `?limit=${limit}` : '';
    return this.request<any[]>(`/users/me/activity${q}`);
  }

  // ─── Settings page extras (iOS-style redesign) ──────────────────────

  // Revoke every active session except the current one. Backend route:
  // DELETE /api/auth/sessions — returns { revoked: number }. If the
  // route is unavailable, callers can fall back to looping revokeSession
  // over each session whose id !== current.
  async revokeAllOtherSessions() {
    return this.request<{ message: string; revoked?: number }>('/auth/sessions', {
      method: 'DELETE',
    });
  }

  // Temporarily deactivate the account ( reversible — backend may set
  // is_deactivated=true). Useful for the "Danger Zone" deactivate button.
  async deactivateMyAccount(password: string) {
    return this.request<{ message: string }>('/auth/deactivate', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  // Update phone number (optionally with a verification code).
  async updateMyPhone(phone: string, code?: string) {
    return this.request<{ message: string }>('/auth/phone', {
      method: 'PUT',
      body: JSON.stringify({ phone, code }),
    });
  }

  // Send an SMS verification code to a new phone number before updating.
  async sendPhoneVerification(phone: string) {
    return this.request<{ message: string }>('/auth/phone/send-code', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  }

  // Submit an in-app rating (1-5 stars) + optional feedback text. Used
  // by the "Rate the app" widget on the About section.
  async submitAppRating(rating: number, feedback?: string) {
    return this.request<{ message: string }>('/auth/me/rate-app', {
      method: 'POST',
      body: JSON.stringify({ rating, feedback }),
    });
  }
}

export const api = new ApiClient();
export default api;
