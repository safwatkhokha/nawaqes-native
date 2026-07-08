import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Package, LayoutDashboard, CreditCard, Zap, Newspaper, Plus,
  Flag, Wallet, Database, Settings, ChevronLeft, ChevronRight, Menu,
  RefreshCw, MessageSquare, Link2, Activity, Radio, MessageCircle,
  Image as ImageIcon, ShoppingBag, BarChart3, Video, Megaphone, BadgeCheck,
  Phone as PhoneIcon, Moon, Sun, LogOut, Bell, Search, X, Banknote,
} from 'lucide-react';
import { DashboardStats, ChartDataPoint, NewsItem } from '../../types';
import { useAppContext } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { adminFetch } from './helpers';
import { AdminTab, TabConfig, AdminUser, ReportItem, SiteSettings, TransactionItem, CommentItem, StoryItem, ChatMessageItem, ActivityItem, DatabaseInfo, MarketPromoRequest } from './types';

// Tab components
import { OverviewTab } from './OverviewTab';
import { UsersTab } from './UsersTab';
import { PostsTab } from './PostsTab';
import { SupportTab } from './SupportTab';
import { CommentsTab } from './CommentsTab';
import { ChargingTab } from './ChargingTab';
import { PromotionsTab } from './PromotionsTab';
import { MarketPromotionsTab } from './MarketPromotionsTab';
import { MarketLiveTab } from './MarketLiveTab';
import { ChannelsTab } from './ChannelsTab';
import { NewsTab } from './NewsTab';
import { PublishTab } from './PublishTab';
import { ReportsTab } from './ReportsTab';
import { CategoriesTab } from './CategoriesTab';
import { TransactionsTab } from './TransactionsTab';
import { WithdrawalsTab } from './WithdrawalsTab';
import { StoriesTab } from './StoriesTab';
import { MessagesTab } from './MessagesTab';
import { SmartLinksTab } from './SmartLinksTab';
import { ActivityTab } from './ActivityTab';
import { BroadcastTab } from './BroadcastTab';
import { DatabaseTab } from './DatabaseTab';
import { SettingsTab } from './SettingsTab';

// ─── Main Component ──────────────────────────────────────────────────
export const AdminDashboard = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const {
    promotionRequests, setPromotionRequests, approvePromotion, rejectPromotion,
    chargingRequests, setChargingRequests, approveCharging, rejectCharging,
    addAdminAlert, refreshData, darkMode, toggleDarkMode,
  } = useAppContext();
  const { dir } = useLanguage();
  const { t } = useTranslation();

  // ─── Core State ──
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [detailedStats, setDetailedStats] = useState<any>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [adminSearch, setAdminSearch] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchResults, setSearchResults] = useState<any>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Global content search ──
  const performSearch = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const data = await adminFetch('GET', `/admin/search?q=${encodeURIComponent(query.trim())}`);
      setSearchResults(data);
    } catch {
      setSearchResults(null);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchChange = (value: string) => {
    setAdminSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (value.trim().length >= 2) {
      setShowSearchResults(true);
      searchDebounceRef.current = setTimeout(() => performSearch(value), 300);
    } else {
      setSearchResults(null);
      setShowSearchResults(false);
    }
  };

  // ─── Users ──
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({ siteName: t('app.nameAr'), maintenanceMode: false, maxUploadSize: 5, defaultWalletBalance: 0 });
  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [allNews, setAllNews] = useState<any[]>([]);

  // ─── Transactions ──
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [txFilter, setTxFilter] = useState<string>('all');
  const [txPage, setTxPage] = useState(1);
  const [txTotal, setTxTotal] = useState(0);

  // ─── Stories / Messages / Comments / Activity ──
  const [adminStories, setAdminStories] = useState<StoryItem[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [adminComments, setAdminComments] = useState<CommentItem[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([]);
  const [smartLinksData, setSmartLinksData] = useState<any>(null);
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [realtimeStats, setRealtimeStats] = useState<any>(null);

  // ─── Market Promos ──
  const [marketPromoRequests, setMarketPromoRequests] = useState<MarketPromoRequest[]>([]);

  // ─── Data Loaders ──
  const loadUsers = async () => {
    try {
      const users = await api.getAdminUsers().catch(() => []);
      setAllUsers(
        (users as any).map((u: any) => ({
          id: u.id, name: u.name, email: u.email, avatar: u.avatar,
          phone: u.phone || '', location: u.location || '',
          walletBalance: u.wallet_balance || u.walletBalance || 0,
          trustScore: u.trust_score || u.trustScore || 0,
          isVerified: !!u.is_verified || !!u.isVerified,
          isAdmin: !!u.is_admin || !!u.isAdmin,
          isTrusted: !!u.is_trusted || !!u.isTrusted,
          isDeactivated: !!u.is_deactivated || !!u.isDeactivated,
          joinDate: u.join_date || u.joinDate || '',
          gender: u.gender || 'male',
          showPhone: !!u.show_phone || !!u.showPhone,
          dateOfBirth: u.date_of_birth || u.dateOfBirth || '',
          interests: (() => { try { return JSON.parse(u.interests || '[]'); } catch { return []; } })(),
        }))
      );
    } catch {}
  };

  const loadReports = async () => {
    try {
      const data = await adminFetch('GET', '/admin/reports').catch(() => []);
      if (Array.isArray(data))
        setReports(
          data.map((r: any) => ({
            id: r.id, postId: r.post_id, userId: r.user_id,
            reporterId: r.reporter_id || '', reporterName: r.reporter_name || t('admin.unknown'),
            reason: r.reason || '', postContent: r.post_content,
            userName: r.user_name, status: r.status || 'pending', createdAt: r.created_at || '',
          }))
        );
    } catch {}
  };

  const loadSettings = async () => {
    try {
      const data = await adminFetch('GET', '/admin/settings').catch(() => null);
      if (data && typeof data === 'object')
        setSiteSettings(prev => ({
          ...prev, ...(data as any),
          maintenanceMode: !!(data as any).maintenanceMode,
          maxUploadSize: (data as any).maxUploadSize || 5,
          defaultWalletBalance: (data as any).defaultWalletBalance || 0,
          siteName: (data as any).siteName || t('app.nameAr'),
        }));
    } catch {}
  };

  const loadCategories = async () => {
    try {
      const data = await api.getCategories().catch(() => []);
      if (Array.isArray(data)) setAllCategories(data as any[]);
    } catch {}
  };

  const loadNews = async () => {
    try {
      const data = await api.getNews().catch(() => []);
      if (Array.isArray(data)) setAllNews(data as any[]);
    } catch {}
  };

  const loadTransactions = async () => {
    try {
      const params = new URLSearchParams({ page: String(txPage), limit: '50' });
      if (txFilter !== 'all') params.set('type', txFilter);
      const data = await adminFetch('GET', `/admin/transactions?${params.toString()}`).catch(() => ({ transactions: [], total: 0 }));
      if (data && (data as any).transactions) {
        setTransactions((data as any).transactions);
        setTxTotal((data as any).total || 0);
      }
    } catch {}
  };

  const loadStories = async () => {
    try {
      const data = await adminFetch('GET', '/admin/stories').catch(() => []);
      if (Array.isArray(data))
        setAdminStories(
          data.map((s: any) => ({
            id: s.id, user_id: s.user_id, user_name: s.user_name || t('admin.unknown'),
            user_avatar: s.user_avatar || '', image: s.image || '',
            type: s.type || 'image', text: s.text || '', created_at: s.created_at || '',
          }))
        );
    } catch {}
  };

  const loadChatMessages = async () => {
    try {
      const data = await adminFetch('GET', '/admin/chat-messages?limit=200').catch(() => []);
      if (Array.isArray(data))
        setChatMessages(
          data.map((m: any) => ({
            id: m.id, sender_id: m.sender_id, receiver_id: m.receiver_id,
            text: m.text || m.content || '', sender_name: m.sender_name || t('admin.unknown'),
            receiver_name: m.receiver_name || t('admin.unknown'), created_at: m.created_at || '',
          }))
        );
    } catch {}
  };

  const loadActivityLog = async () => {
    try {
      const data = await adminFetch('GET', '/admin/activity-log?limit=100').catch(() => []);
      if (Array.isArray(data)) setActivityLog(data as ActivityItem[]);
    } catch {}
  };

  const loadDatabaseInfo = async () => {
    try {
      const data = await adminFetch('GET', '/admin/database-info').catch(() => null);
      if (data) setDbInfo(data as DatabaseInfo);
    } catch {}
  };

  const loadComments = async () => {
    try {
      const data = await adminFetch('GET', '/admin/comments?limit=200').catch(() => []);
      if (Array.isArray(data)) setAdminComments(data as CommentItem[]);
    } catch {}
  };

  const loadSmartLinks = async () => {
    try {
      const data = await adminFetch('GET', '/admin/smart-links').catch(() => null);
      if (data) setSmartLinksData(data);
    } catch {}
  };

  const loadRealtimeStats = async () => {
    try {
      const data = await adminFetch('GET', '/admin/dashboard/realtime').catch(() => null);
      if (data) setRealtimeStats(data);
    } catch {}
  };

  // ─── Initial Data Loading ──
  useEffect(() => {
    const fetchAdminData = async () => {
      try {
        const [statsData, chartDataRes, postsData, promoReqs, chargeReqs, detStats, marketPromoReqs] = await Promise.all([
          api.getAdminStats().catch(() => null),
          api.getAdminChart().catch(() => []),
          adminFetch('GET', '/admin/all-posts?limit=50').catch(() => ({ posts: [] })),
          api.getPromotionRequests().catch(() => []),
          api.getChargingRequests().catch(() => []),
          api.getAdminDetailedStats().catch(() => null),
          api.getMarketPromotionRequests().catch(() => []),
        ]);
        if (statsData) setStats(statsData as any);
        if (detStats) setDetailedStats(detStats);
        if (Array.isArray(chartDataRes) && chartDataRes.length > 0) setChartData(chartDataRes as any);
        if (postsData && (postsData as any).posts) {
          setPosts((postsData as any).posts);
        }
        if (Array.isArray(promoReqs)) {
          setPromotionRequests(
            (promoReqs as any[]).map((r: any) => ({
              id: r.id, postId: r.post_id, postContent: r.post_content,
              postAuthor: { id: r.author_id, name: r.author_name, avatar: r.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.author_id}` },
              tier: r.tier, price: r.price, status: r.status, createdAt: r.created_at,
              packageName: r.package_name, duration: r.duration, estimatedReach: r.estimated_reach,
              maxNotifications: r.max_notifications, includeMessages: !!r.include_messages, targeting: r.targeting,
              targetCity: r.target_city, targetInterests: r.target_interests ? JSON.parse(r.target_interests) : [],
              targetAgeMin: r.target_age_min || 0, targetAgeMax: r.target_age_max || 0,
              cityCount: r.city_count || 1,
            }))
          );
        }
        if (Array.isArray(chargeReqs)) {
          setChargingRequests(
            (chargeReqs as any[]).map((r: any) => ({
              id: r.id, userId: r.user_id, userName: r.user_name,
              userAvatar: r.user_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.user_id}`,
              userPhone: r.user_phone || '', amount: r.amount, method: r.method,
              receiptImage: r.receipt_image || '', status: r.status, createdAt: r.created_at,
            }))
          );
        }
        if (Array.isArray(marketPromoReqs)) {
          setMarketPromoRequests(
            (marketPromoReqs as any[]).map((r: any) => ({
              id: r.id, listingId: r.listing_id,
              listingTitle: r.listing_title || r.listing_id,
              sellerId: r.seller_id, sellerName: r.seller_name || t('common.user'),
              sellerAvatar: r.seller_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.seller_id}`,
              tier: r.tier, packageName: r.package_name, price: r.price,
              duration: r.duration, estimatedReach: r.estimated_reach,
              targeting: r.targeting, targetCity: r.target_city,
              targetInterests: r.target_interests,
              targetAgeMin: r.target_age_min || 0, targetAgeMax: r.target_age_max || 0,
              status: r.status, createdAt: r.created_at,
            }))
          );
        }
      } catch (e) {
        console.error('Error fetching admin data:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchAdminData();
    loadUsers();
    loadReports();
    loadSettings();
    loadCategories();
    loadNews();
  }, []);

  // ─── Tab-based lazy loading ──
  useEffect(() => {
    if (activeTab === 'transactions') loadTransactions();
    if (activeTab === 'stories') loadStories();
    if (activeTab === 'messages') loadChatMessages();
    if (activeTab === 'activity') loadActivityLog();
    if (activeTab === 'database') loadDatabaseInfo();
    if (activeTab === 'comments') loadComments();
    if (activeTab === 'smartlinks') loadSmartLinks();
    if (activeTab === 'overview') loadRealtimeStats();
  }, [activeTab, txPage, txFilter]);

  // ─── Sidebar Config ──
  const tabs: TabConfig[] = [
    { id: 'overview', label: t('admin.tab_overview'), icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'users', label: t('admin.tab_users'), icon: <Users className="w-5 h-5" />, badge: allUsers.length },
    { id: 'posts', label: t('admin.tab_posts'), icon: <Package className="w-5 h-5" />, badge: posts.length },
    { id: 'support', label: t('admin.tab_support'), icon: <PhoneIcon className="w-5 h-5" />, badge: posts.filter((p: any) => p.category === 'support_ticket' || p.category?.startsWith('complaint_')).length },
    { id: 'comments', label: t('admin.tab_comments'), icon: <MessageCircle className="w-5 h-5" /> },
    { id: 'charging', label: t('admin.tab_chargeRequests'), icon: <CreditCard className="w-5 h-5" />, badge: chargingRequests.filter(c => c.status === 'pending').length },
    { id: 'withdrawals', label: 'طلبات السحب والشحن', icon: <Banknote className="w-5 h-5" /> },
    { id: 'promotions', label: t('admin.tab_promotionRequests'), icon: <Zap className="w-5 h-5" />, badge: promotionRequests.filter(p => p.status === 'pending').length },
    { id: 'market-promotions', label: t('admin.tab_marketPromotions'), icon: <ShoppingBag className="w-5 h-5" />, badge: marketPromoRequests.filter(p => p.status === 'pending').length },
    { id: 'market-live', label: 'سوق لايف', icon: <Video className="w-5 h-5" /> },
    { id: 'channels', label: 'القنوات', icon: <Megaphone className="w-5 h-5" /> },
    { id: 'news', label: t('admin.tab_news'), icon: <Newspaper className="w-5 h-5" />, badge: allNews.length },
    { id: 'publish', label: t('admin.tab_publishAsAdmin'), icon: <Plus className="w-5 h-5" /> },
    { id: 'reports', label: t('admin.tab_reports'), icon: <Flag className="w-5 h-5" />, badge: reports.length },
    { id: 'categories', label: t('admin.tab_categories'), icon: <BarChart3 className="w-5 h-5" />, badge: allCategories.length },
    { id: 'transactions', label: t('admin.tab_financial'), icon: <Wallet className="w-5 h-5" /> },
    { id: 'stories', label: t('admin.tab_stories'), icon: <ImageIcon className="w-5 h-5" /> },
    { id: 'messages', label: t('admin.tab_messages'), icon: <MessageSquare className="w-5 h-5" /> },
    { id: 'smartlinks', label: t('admin.tab_smartReach'), icon: <Link2 className="w-5 h-5" /> },
    { id: 'activity', label: t('admin.tab_activity'), icon: <Activity className="w-5 h-5" /> },
    { id: 'broadcast', label: t('admin.tab_broadcast'), icon: <Radio className="w-5 h-5" /> },
    { id: 'database', label: t('admin.tab_database'), icon: <Database className="w-5 h-5" /> },
    { id: 'settings', label: t('admin.tab_settings'), icon: <Settings className="w-5 h-5" /> },
  ];

  // ─── Shared props for tabs ── (removed unused)

  // ─── Loading ──
  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`} dir="rtl">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className={`font-bold text-lg ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('admin.loading')}</p>
          <p className={`text-sm ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>{t('admin.platformManagement')}</p>
        </div>
      </div>
    );
  }

  // ─── Render ──
  return (
    <div className={`min-h-screen flex ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`} dir={dir}>
      {/* ─── Sidebar ─── */}
      <aside
        className={`${sidebarCollapsed ? 'w-[68px]' : 'w-60'} ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        } border-l flex flex-col transition-all duration-300 sticky top-0 h-screen overflow-hidden shrink-0 shadow-sm`}
      >
        {/* Logo Area */}
        <div className={`p-3 border-b flex items-center gap-2.5 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <button
            onClick={() => navigate('/')}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
              darkMode ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!sidebarCollapsed && (
            <h1 className={`text-sm font-black flex items-center gap-1.5 truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              <div className="w-7 h-7 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm">
                <LayoutDashboard className="w-4 h-4" />
              </div>
              {t('admin.title')}
            </h1>
          )}
        </div>

        {/* Search Box */}
        {!sidebarCollapsed && (
          <div className="px-2 py-2 border-b relative z-50" style={{ borderColor: darkMode ? '#374151' : '#f3f4f6' }}>
            <div className="relative">
              <Search className="absolute top-1/2 -translate-y-1/2 right-2.5 w-3.5 h-3.5 pointer-events-none" style={{ color: darkMode ? '#6B7280' : '#9CA3AF' }} />
              <input
                type="text"
                value={adminSearch}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => adminSearch.trim().length >= 2 && setShowSearchResults(true)}
                onBlur={() => setTimeout(() => setShowSearchResults(false), 250)}
                placeholder="بحث شامل..."
                className={`w-full text-xs font-medium rounded-lg border outline-none transition-all ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-orange-500'
                    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-400'
                } py-2 pr-8 pl-7`}
              />
              {adminSearch && (
                <button
                  onClick={() => { setAdminSearch(''); setSearchResults(null); setShowSearchResults(false); }}
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center hover:bg-black/10"
                >
                  <X className="w-3 h-3" style={{ color: darkMode ? '#9CA3AF' : '#9CA3AF' }} />
                </button>
              )}
            </div>

            {/* Search Results Dropdown */}
            {showSearchResults && adminSearch.trim().length >= 2 && (
              <div className={`absolute top-full right-2 left-2 mt-1 rounded-xl border shadow-2xl max-h-[60vh] overflow-y-auto z-[100] ${darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}>
                {searchLoading ? (
                  <div className="p-4 text-center">
                    <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className={`text-[10px] mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>جاري البحث...</p>
                  </div>
                ) : searchResults ? (
                  <div className="py-1">
                    {/* Users */}
                    {searchResults.users?.length > 0 && (
                      <>
                        <div className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>المستخدمون ({searchResults.users.length})</div>
                        {searchResults.users.map((u: any) => (
                          <button
                            key={u.id}
                            onClick={() => { setActiveTab('users'); setShowSearchResults(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-2 transition-colors text-right ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
                          >
                            <img src={u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`} alt="" className="w-7 h-7 rounded-full shrink-0" />
                            <div className="flex-1 min-w-0 text-right">
                              <p className={`text-xs font-bold truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>{u.name}</p>
                              <p className={`text-[9px] truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{u.email || u.phone}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              {u.isVerified && <BadgeCheck className="w-3 h-3 text-blue-500" />}
                              {u.isAdmin && <span className="text-[8px] bg-orange-500 text-white px-1 py-0.5 rounded font-bold">أدمن</span>}
                            </div>
                          </button>
                        ))}
                      </>
                    )}
                    {/* Posts */}
                    {searchResults.posts?.length > 0 && (
                      <>
                        <div className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider border-t ${darkMode ? 'text-gray-500 border-gray-700' : 'text-gray-400 border-gray-100'}`}>المنشورات ({searchResults.posts.length})</div>
                        {searchResults.posts.map((p: any) => (
                          <button
                            key={p.id}
                            onClick={() => { navigate(`/post/${p.id}`); setShowSearchResults(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-2 transition-colors text-right ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
                          >
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${p.type === 'ad' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                              {p.type === 'ad' ? <ShoppingBag className="w-3.5 h-3.5" /> : <Package className="w-3.5 h-3.5" />}
                            </div>
                            <div className="flex-1 min-w-0 text-right">
                              <p className={`text-xs font-medium truncate ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{p.content || '(بدون نص)'}</p>
                              <p className={`text-[9px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{p.authorName}</p>
                            </div>
                            {p.price && <span className="text-[10px] font-bold text-orange-500 shrink-0">{p.price} ج.م</span>}
                          </button>
                        ))}
                      </>
                    )}
                    {/* Listings */}
                    {searchResults.listings?.length > 0 && (
                      <>
                        <div className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider border-t ${darkMode ? 'text-gray-500 border-gray-700' : 'text-gray-400 border-gray-100'}`}>الإعلانات ({searchResults.listings.length})</div>
                        {searchResults.listings.map((l: any) => (
                          <button
                            key={l.id}
                            onClick={() => { navigate(`/market/listing/${l.id}`); setShowSearchResults(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-2 transition-colors text-right ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
                          >
                            <div className="w-7 h-7 rounded-lg bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                              <ShoppingBag className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0 text-right">
                              <p className={`text-xs font-medium truncate ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{l.title}</p>
                              <p className={`text-[9px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{l.sellerName} · {l.category}</p>
                            </div>
                            {l.price && <span className="text-[10px] font-bold text-green-500 shrink-0">{l.price} {l.currency}</span>}
                          </button>
                        ))}
                      </>
                    )}
                    {/* Channels */}
                    {searchResults.channels?.length > 0 && (
                      <>
                        <div className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider border-t ${darkMode ? 'text-gray-500 border-gray-700' : 'text-gray-400 border-gray-100'}`}>القنوات ({searchResults.channels.length})</div>
                        {searchResults.channels.map((c: any) => (
                          <button
                            key={c.id}
                            onClick={() => { setActiveTab('channels'); setShowSearchResults(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-2 transition-colors text-right ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
                          >
                            <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                              <Megaphone className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0 text-right">
                              <p className={`text-xs font-medium truncate ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{c.name}</p>
                              <p className={`text-[9px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>@{c.handle} · {c.subscriberCount} مشترك</p>
                            </div>
                            {c.isVerified && <BadgeCheck className="w-3 h-3 text-blue-500 shrink-0" />}
                          </button>
                        ))}
                      </>
                    )}
                    {/* No results */}
                    {!searchResults.users?.length && !searchResults.posts?.length && !searchResults.listings?.length && !searchResults.channels?.length && (
                      <div className="p-4 text-center">
                        <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>لا توجد نتائج</p>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-1.5 space-y-0.5 custom-scrollbar">
          {tabs
            .filter(tab => !adminSearch.trim() || tab.label.toLowerCase().includes(adminSearch.toLowerCase()) || tab.id.toLowerCase().includes(adminSearch.toLowerCase()))
            .map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                activeTab === tab.id
                  ? `bg-gradient-to-l from-orange-500 to-orange-600 text-white shadow-lg ${darkMode ? 'shadow-orange-900/30' : 'shadow-orange-200/50'}`
                  : darkMode
                    ? 'text-gray-400 hover:bg-gray-700/60'
                    : 'text-gray-600 hover:bg-gray-50'
              } ${sidebarCollapsed ? 'justify-center' : ''}`}
              title={tab.label}
            >
              <span className={`shrink-0 ${activeTab === tab.id ? 'text-white' : darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {tab.icon}
              </span>
              {!sidebarCollapsed && (
                <>
                  <span className="truncate flex-1 text-start">{tab.label}</span>
                  {tab.badge ? (
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${
                        activeTab === tab.id
                          ? 'bg-white/20 text-white'
                          : darkMode
                            ? 'bg-orange-900/40 text-orange-400'
                            : 'bg-orange-50 text-orange-600'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  ) : null}
                </>
              )}
            </button>
          ))}
        </nav>

        {/* Collapse Button */}
        <div className={`p-2 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`w-full flex items-center justify-center gap-2 px-2 py-2 rounded-xl transition-colors ${
              darkMode ? 'text-gray-500 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-50'
            }`}
          >
            {sidebarCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {!sidebarCollapsed && <span className="text-[10px] font-bold">{t('admin.collapseSidebar')}</span>}
          </button>
        </div>

        {/* User Info */}
        <div className={`p-2 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className="flex items-center gap-2 px-2 py-1.5">
            {currentUser && (
              <img
                src={currentUser.avatarBase64 || currentUser.avatar}
                alt=""
                className="w-8 h-8 rounded-full border-2 border-orange-300 shrink-0"
              />
            )}
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <p className={`text-[10px] font-bold truncate ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                  {currentUser?.name}
                </p>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                    darkMode ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-600'
                  }`}
                >
                  {t('admin.admin')}
                </span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {/* Header */}
        <header
          className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border-b sticky top-0 z-40 px-6 py-4 shadow-sm`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className={`lg:hidden w-9 h-9 rounded-xl flex items-center justify-center ${
                  darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
                }`}
              >
                <Menu className="w-5 h-5" />
              </button>
              <h2 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {tabs.find((tab) => tab.id === activeTab)?.label || t('admin.title')}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleDarkMode}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                  darkMode ? 'bg-gray-700 text-yellow-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                title={darkMode ? t('admin.lightMode') : t('admin.darkMode')}
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                onClick={() => navigate('/')}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                  darkMode ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                title={t('admin.homePage')}
              >
                <LayoutDashboard className="w-4 h-4" />
              </button>
              <button
                onClick={refreshData}
                className={`flex items-center gap-1.5 text-xs font-bold transition-colors ${
                  darkMode ? 'text-gray-400 hover:text-orange-400' : 'text-gray-500 hover:text-orange-500'
                }`}
              >
                <RefreshCw className="w-4 h-4" />
                {t('admin.update')}
              </button>
            </div>
          </div>
        </header>

        <div className="p-4 md:p-6 max-w-7xl">
          {activeTab === 'overview' && (
            <OverviewTab
              stats={stats}
              detailedStats={detailedStats}
              chartData={chartData}
              posts={posts}
              realtimeStats={realtimeStats}
              darkMode={darkMode}
              loadRealtimeStats={loadRealtimeStats}
            />
          )}
          {activeTab === 'users' && (
            <UsersTab
              allUsers={allUsers}
              setAllUsers={setAllUsers}
              loadUsers={loadUsers}
              darkMode={darkMode}
            />
          )}
          {activeTab === 'posts' && (
            <PostsTab
              posts={posts}
              setPosts={setPosts}
              darkMode={darkMode}
            />
          )}
          {activeTab === 'support' && (
            <SupportTab
              posts={posts}
              setPosts={setPosts}
              darkMode={darkMode}
              navigate={navigate}
            />
          )}
          {activeTab === 'comments' && (
            <CommentsTab
              adminComments={adminComments}
              setAdminComments={setAdminComments}
              darkMode={darkMode}
            />
          )}
          {activeTab === 'charging' && (
            <ChargingTab
              chargingRequests={chargingRequests}
              approveCharging={approveCharging}
              rejectCharging={rejectCharging}
              darkMode={darkMode}
            />
          )}
          {activeTab === 'withdrawals' && (
            <WithdrawalsTab darkMode={darkMode} />
          )}
          {activeTab === 'promotions' && (
            <PromotionsTab
              promotionRequests={promotionRequests}
              approvePromotion={approvePromotion}
              rejectPromotion={rejectPromotion}
              darkMode={darkMode}
              navigate={navigate}
            />
          )}
          {activeTab === 'market-promotions' && (
            <MarketPromotionsTab
              marketPromoRequests={marketPromoRequests}
              setMarketPromoRequests={setMarketPromoRequests}
              darkMode={darkMode}
            />
          )}
          {activeTab === 'market-live' && (
            <MarketLiveTab darkMode={darkMode} />
          )}
          {activeTab === 'channels' && (
            <ChannelsTab darkMode={darkMode} />
          )}
          {activeTab === 'news' && (
            <NewsTab
              allNews={allNews}
              loadNews={loadNews}
              refreshData={refreshData}
              addAdminAlert={addAdminAlert}
              darkMode={darkMode}
            />
          )}
          {activeTab === 'publish' && (
            <PublishTab darkMode={darkMode} refreshData={refreshData} />
          )}
          {activeTab === 'reports' && (
            <ReportsTab reports={reports} setReports={setReports} darkMode={darkMode} />
          )}
          {activeTab === 'categories' && (
            <CategoriesTab
              allCategories={allCategories}
              loadCategories={loadCategories}
              darkMode={darkMode}
            />
          )}
          {activeTab === 'transactions' && (
            <TransactionsTab
              transactions={transactions}
              txFilter={txFilter}
              setTxFilter={setTxFilter}
              txPage={txPage}
              setTxPage={setTxPage}
              txTotal={txTotal}
              darkMode={darkMode}
            />
          )}
          {activeTab === 'stories' && (
            <StoriesTab adminStories={adminStories} setAdminStories={setAdminStories} darkMode={darkMode} />
          )}
          {activeTab === 'messages' && (
            <MessagesTab chatMessages={chatMessages} setChatMessages={setChatMessages} darkMode={darkMode} />
          )}
          {activeTab === 'smartlinks' && (
            <SmartLinksTab smartLinksData={smartLinksData} darkMode={darkMode} />
          )}
          {activeTab === 'activity' && (
            <ActivityTab activityLog={activityLog} darkMode={darkMode} />
          )}
          {activeTab === 'broadcast' && (
            <BroadcastTab darkMode={darkMode} />
          )}
          {activeTab === 'database' && (
            <DatabaseTab dbInfo={dbInfo} loadDatabaseInfo={loadDatabaseInfo} darkMode={darkMode} />
          )}
          {activeTab === 'settings' && (
            <SettingsTab
              siteSettings={siteSettings}
              setSiteSettings={setSiteSettings}
              loadSettings={loadSettings}
              darkMode={darkMode}
            />
          )}
        </div>
      </main>
    </div>
  );
};
