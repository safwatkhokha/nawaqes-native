import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';
import {
  Users, Package, TrendingUp, DollarSign, ShieldAlert, CheckCircle,
  Trash2, Search, Settings, LayoutDashboard, Eye, EyeOff,
  X as CloseIcon, Megaphone, Plus, Bell, MessageCircle,
  Clock, Check, XCircle, AlertTriangle, Zap, Newspaper, UserCheck, CreditCard,
  Flag, Edit3, Save, Globe, Shield, Wallet, Activity, BarChart3,
  Ban, Star, StarOff, RefreshCw, Database, Server, Wrench, FileText,
  ChevronLeft, ChevronRight, Menu, Send, HardDrive, Layers,
  Image as ImageIcon, Video, MessageSquare, List, Radio, Cog,
  UserX, UserMinus, ArrowUpRight, ArrowDownRight, Filter, Hash,
  Calendar, Info, ExternalLink, Download, ThumbsUp, Link2, MousePointer,
  ShoppingBag, Phone as PhoneIcon
} from 'lucide-react';
import { DashboardStats, ChartDataPoint, Post, PromotionRequest, ChargingRequest, NewsItem, Story, Category, ChatMessage } from '../types';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import { MarketListingsTab } from './admin/MarketListingsTab';
import { useLanguage } from '../contexts/LanguageContext';
import { formatRelativeTimeAr, parseDBTimestamp } from '../utils/time';

// ─── Admin Tab Type ──────────────────────────────────────────────────
    type AdminTab = 'overview' | 'users' | 'posts' | 'support' | 'comments' | 'charging' | 'promotions' | 'market-promotions' | 'market-listings' | 'news' | 'publish' | 'reports' | 'categories' | 'transactions' | 'stories' | 'messages' | 'smartlinks' | 'activity' | 'broadcast' | 'database' | 'settings';

// ─── Admin Fetch Helper ──────────────────────────────────────────────
async function adminFetch<T = any>(method: string, endpoint: string, body?: any): Promise<T> {
  const token = api.getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`/api${endpoint}`, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Network error' }));
    throw new Error(data.error || 'Request failed');
  }
  const text = await res.text();
  if (!text || text.trim() === '') return {} as T;
  return JSON.parse(text) as T;
}

// ─── Interfaces ──────────────────────────────────────────────────────
interface AdminUser {
  id: string; name: string; email: string; avatar: string;
  phone: string; location: string; walletBalance: number; trustScore: number;
  isVerified: boolean; isAdmin: boolean; isTrusted: boolean; isDeactivated: boolean;
  joinDate: string; gender: string; showPhone: boolean; dateOfBirth?: string; interests?: string[];
}
interface ReportItem {
  id: string; postId?: string; userId?: string; reporterId: string;
  reporterName: string; reason: string; postContent?: string;
  userName?: string; status: string; createdAt: string;
}
interface SiteSettings {
  siteName: string; maintenanceMode: boolean; maxUploadSize: number; defaultWalletBalance: number;
}
interface ActivityItem {
  id: string; activity_type: string; user_name?: string; content?: string;
  type?: string; tx_type?: string; status?: string; amount?: number;
  package_name?: string; created_at: string;
}
interface TransactionItem {
  id: string; user_id: string; user_name?: string; user_email?: string;
  type: string; amount: number; method: string; status: string; created_at: string;
}
interface ChatMessageItem {
  id: string; sender_id: string; receiver_id: string; text: string;
  sender_name?: string; receiver_name?: string; created_at: string;
}
interface StoryItem {
  id: string; user_id: string; user_name?: string; user_avatar?: string;
  image?: string; type?: string; text?: string; created_at: string;
}
interface DatabaseInfo {
  tables: Record<string, number>; totalTables: number; dbSize: number; dbSizeFormatted: string;
}
interface CommentItem {
  id: string; post_id: string; author_id: string; author_name: string;
  author_avatar: string; content: string; created_at: string;
  post_content?: string; author_verified?: boolean;
}

const PIE_COLORS = ['#f27d26', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899'];
const ORANGE = '#f27d26';
const formatTimeAgo = (dateStr: string) => formatRelativeTimeAr(dateStr);

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  deposit: 'إيداع', charge_request: 'طلب شحن', promotion_debit: 'خصم ترويج',
  promotion_refund: 'استرداد ترويج', admin_deposit: 'إيداع من المدير', admin_withdrawal: 'سحب من المدير',
};

// ─── Stat Card Component ─────────────────────────────────────────────
const StatCard = ({ icon, label, value, trend, color = ORANGE, darkMode = false }: { icon: React.ReactNode; label: string; value: string | number; trend?: string; color?: string; darkMode?: boolean }) => (
  <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl p-4 border hover:shadow-lg hover:shadow-orange-50 transition-all duration-300 group`}>
    <div className="flex items-start justify-between mb-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + '15' }}>
        <span style={{ color }} className="w-5 h-5">{icon}</span>
      </div>
      {trend && (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${trend.startsWith('+') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
          {trend}
        </span>
      )}
    </div>
    <p className={`text-2xl font-black mb-0.5 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{value}</p>
    <p className={`text-[11px] font-medium ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{label}</p>
  </div>
);

// ─── Section Card ────────────────────────────────────────────────────
const Section = ({ title, icon, children, action, darkMode = false }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode; darkMode?: boolean }) => (
  <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border overflow-hidden`}>
    <div className={`flex items-center justify-between px-5 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-50'}`}>
      <h3 className={`text-sm font-black flex items-center gap-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
        <span className="text-orange-500">{icon}</span>{title}
      </h3>
      {action}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

// ─── Badge ───────────────────────────────────────────────────────────
const Badge = ({ children, color = 'gray', darkMode = false }: { children: React.ReactNode; color?: string; darkMode?: boolean }) => {
  const cls: Record<string, string> = {
    green: 'bg-green-50 text-green-600', red: 'bg-red-50 text-red-500',
    orange: 'bg-orange-50 text-orange-600', blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600', yellow: 'bg-yellow-50 text-yellow-600',
    gray: darkMode ? "'bg-gray-700 text-gray-400'" : "'bg-gray-50 text-gray-500'", pink: 'bg-pink-50 text-pink-600',
  };
  const darkCls: Record<string, string> = {
    green: 'bg-green-900/40 text-green-400', red: 'bg-red-900/40 text-red-400',
    orange: 'bg-orange-900/40 text-orange-400', blue: 'bg-blue-900/40 text-blue-400',
    purple: 'bg-purple-900/40 text-purple-400', yellow: 'bg-yellow-900/40 text-yellow-400',
    gray: 'bg-gray-700 text-gray-400', pink: 'bg-pink-900/40 text-pink-400',
  };
  const colorMap = darkMode ? darkCls : cls;
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colorMap[color] || colorMap.gray}`}>{children}</span>;
};

// ─── Button ──────────────────────────────────────────────────────────
const Btn = ({ children, onClick, variant = 'ghost', size = 'sm', disabled, className = '', title, darkMode = false }: { children: React.ReactNode; onClick?: () => void; variant?: 'ghost' | 'primary' | 'danger' | 'outline'; size?: 'sm' | 'md' | 'xs'; disabled?: boolean; className?: string; title?: string; darkMode?: boolean }) => {
  const base = 'inline-flex items-center justify-center gap-1.5 font-bold rounded-xl transition-all disabled:opacity-40 ';
  const vars: Record<string, string> = darkMode ? {
    ghost: 'text-gray-400 hover:bg-gray-700 ',
    primary: 'bg-orange-500 text-white hover:bg-orange-600 shadow-sm ',
    danger: 'text-red-400 hover:bg-red-900/30 ',
    outline: 'border border-gray-600 text-gray-300 hover:bg-gray-700 ',
  } : {
    ghost: 'text-gray-500 hover:bg-gray-50 ',
    primary: 'bg-orange-500 text-white hover:bg-orange-600 shadow-sm ',
    danger: 'text-red-500 hover:bg-red-50 ',
    outline: 'border border-gray-200 text-gray-600 hover:bg-gray-50 ',
  };
  const sizes: Record<string, string> = { xs: 'px-2 py-1 text-[10px]', sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' };
  return <button onClick={onClick} disabled={disabled} title={title} className={`${base}${vars[variant]}${sizes[size]}${className}`}>{children}</button>;
};

// ─── Empty State ─────────────────────────────────────────────────────
const EmptyState = ({ icon, text, darkMode = false }: { icon: React.ReactNode; text: string; darkMode?: boolean }) => (
  <div className={`flex flex-col items-center justify-center py-12 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>
    <span className="w-12 h-12 mb-3">{icon}</span>
    <p className={`text-sm font-medium ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{text}</p>
  </div>
);

// ─── Main Component ──────────────────────────────────────────────────
export const AdminDashboard = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const {
    posts: contextPosts, addPost,
    promotionRequests, setPromotionRequests, approvePromotion, rejectPromotion,
    chargingRequests, setChargingRequests, approveCharging, rejectCharging,
    adminAlerts, addAdminAlert, removeAdminAlert, refreshData,
    categories, newsItems, darkMode
  } = useAppContext();
  const { t } = useTranslation();
  const { dir } = useLanguage();

  // ─── Core State ──
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [detailedStats, setDetailedStats] = useState<any>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ─── Alert/News Form ──
  const [alertTitle, setAlertTitle] = useState('');
  const [alertContent, setAlertContent] = useState('');
  const [alertSource, setAlertSource] = useState('نواقص');
  const [alertCategory, setAlertCategory] = useState<'egypt' | 'world' | 'urgent' | 'general'>('general');
  const [isAlert, setIsAlert] = useState(false);

  // ─── Admin Post Form ──
  const [adminPostContent, setAdminPostContent] = useState('');
  const [adminPostImage, setAdminPostImage] = useState('');
  const [adminPostType, setAdminPostType] = useState<'ad' | 'news' | 'status'>('news');
  const [adminPostPrice, setAdminPostPrice] = useState('');
  const [adminPostLocation, setAdminPostLocation] = useState('');
  const [adminPostCategory, setAdminPostCategory] = useState('');
  const [adminPostPromoted, setAdminPostPromoted] = useState(false);

  // ─── Users ──
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userDetail, setUserDetail] = useState<any>(null);
  const [walletAmount, setWalletAmount] = useState('');
  const [walletReason, setWalletReason] = useState('');
  const [showUserModal, setShowUserModal] = useState(false);
  const [userFilter, setUserFilter] = useState<'all' | 'verified' | 'admin' | 'deactivated' | 'trusted'>('all');
  const [userSort, setUserSort] = useState<'name' | 'joinDate' | 'wallet' | 'trust'>('joinDate');
  const [warningReason, setWarningReason] = useState('');

  // ─── Posts ──
  const [postSearch, setPostSearch] = useState('');
  const [postStatusFilter, setPostStatusFilter] = useState<'all' | 'active' | 'flagged'>('all');
  const [postTypeFilter, setPostTypeFilter] = useState<'all' | 'ad' | 'news' | 'status' | 'support' | 'complaint'>('all');
  const [postPage, setPostPage] = useState(1);
  const [postTotal, setPostTotal] = useState(0);
  const [supportFilter, setSupportFilter] = useState<'all' | 'support' | 'complaint'>('all');

  // ─── Comments ──
  const [adminComments, setAdminComments] = useState<CommentItem[]>([]);
  const [commentSearch, setCommentSearch] = useState('');

  // ─── Charging ──
  const [chargingFilter, setChargingFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  // ─── Promotions ──
  const [promoFilter, setPromoFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  // ─── Market Promotions ──
  const [marketPromoRequests, setMarketPromoRequests] = useState<any[]>([]);
  const [marketPromoFilter, setMarketPromoFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  // ─── Reports ──
  const [reports, setReports] = useState<ReportItem[]>([]);

  // ─── Categories ──
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [allCategories, setAllCategories] = useState<any[]>([]);

  // ─── News ──
  const [allNews, setAllNews] = useState<any[]>([]);
  const [newsFilter, setNewsFilter] = useState<'all' | 'egypt' | 'world' | 'urgent' | 'general'>('all');
  const [editingNewsId, setEditingNewsId] = useState<string | null>(null);
  const [newsForm, setNewsForm] = useState({ title: '', content: '', source: 'نواقص', category: 'general' as 'egypt' | 'world' | 'urgent' | 'general', isAlert: false });

  // ─── Settings ──
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({ siteName: 'نواقص', maintenanceMode: false, maxUploadSize: 5, defaultWalletBalance: 0 });

  // ─── Transactions ──
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [txFilter, setTxFilter] = useState<string>('all');
  const [txPage, setTxPage] = useState(1);
  const [txTotal, setTxTotal] = useState(0);

  // ─── Stories ──
  const [adminStories, setAdminStories] = useState<StoryItem[]>([]);

  // ─── Chat Messages ──
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [msgSearch, setMsgSearch] = useState('');

  // ─── Smart Links ──
  const [smartLinksData, setSmartLinksData] = useState<any>(null);

  // ─── Activity Log ──
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([]);

  // ─── Broadcast ──
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastType, setBroadcastType] = useState<'system' | 'alert' | 'promotion'>('system');
  const [broadcastSending, setBroadcastSending] = useState(false);

  // ─── Database ──
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [cleanupRunning, setCleanupRunning] = useState(false);

  // ─── Realtime ──
  const [realtimeStats, setRealtimeStats] = useState<any>(null);

  // ─── Data Loading ──
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
        if (postsData && (postsData as any).posts) { setPosts((postsData as any).posts); setPostTotal((postsData as any).total || 0); }
        if (Array.isArray(promoReqs)) {
          setPromotionRequests((promoReqs as any[]).map((r: any) => ({
            id: r.id, postId: r.post_id, postContent: r.post_content,
            postAuthor: { id: r.author_id, name: r.author_name, avatar: r.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.author_id}` },
            tier: r.tier, price: r.price, status: r.status, createdAt: r.created_at,
            packageName: r.package_name, duration: r.duration, estimatedReach: r.estimated_reach,
            maxNotifications: r.max_notifications, includeMessages: !!r.include_messages, targeting: r.targeting,
            targetCity: r.target_city, targetInterests: r.target_interests ? JSON.parse(r.target_interests) : [],
            targetAgeMin: r.target_age_min || 0, targetAgeMax: r.target_age_max || 0,
            cityCount: r.city_count || 1,
          })));
        }
        if (Array.isArray(chargeReqs)) {
          setChargingRequests((chargeReqs as any[]).map((r: any) => ({
            id: r.id, userId: r.user_id, userName: r.user_name,
            userAvatar: r.user_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.user_id}`,
            userPhone: r.user_phone || '',
            amount: r.amount, method: r.method, receiptImage: r.receipt_image || '',
            status: r.status, createdAt: r.created_at,
          })));
        }
        if (Array.isArray(marketPromoReqs)) {
          setMarketPromoRequests((marketPromoReqs as any[]).map((r: any) => ({
            id: r.id,
            listingId: r.listing_id,
            listingTitle: r.listing_title || r.listing_id,
            sellerId: r.seller_id,
            sellerName: r.seller_name || 'مستخدم',
            sellerAvatar: r.seller_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.seller_id}`,
            tier: r.tier,
            packageName: r.package_name,
            price: r.price,
            duration: r.duration,
            estimatedReach: r.estimated_reach,
            targeting: r.targeting,
            targetCity: r.target_city,
            targetInterests: r.target_interests,
            targetAgeMin: r.target_age_min || 0,
            targetAgeMax: r.target_age_max || 0,
            status: r.status,
            createdAt: r.created_at,
          })));
        }
      } catch (e) { console.error('Error fetching admin data:', e); } finally { setLoading(false); }
    };
    fetchAdminData();
    loadUsers(); loadReports(); loadSettings(); loadCategories(); loadNews();
  }, []);

  useEffect(() => {
    if (activeTab === 'transactions') loadTransactions();
    if (activeTab === 'stories') loadStories();
    if (activeTab === 'messages') loadChatMessages();
    if (activeTab === 'activity') loadActivityLog();
    if (activeTab === 'database') loadDatabaseInfo();
    if (activeTab === 'comments') loadComments();
    if (activeTab === 'smartlinks') loadSmartLinks();
    if (activeTab === 'overview') loadRealtimeStats();
  }, [activeTab, txPage, txFilter, postPage, postStatusFilter, postTypeFilter, postSearch]);

  // ─── Data Loaders ──
  const loadUsers = async () => { try { const users = await api.getAdminUsers().catch(() => []); setAllUsers((users as any).map((u: any) => ({ id: u.id, name: u.name, email: u.email, avatar: u.avatar, phone: u.phone || '', location: u.location || '', walletBalance: u.wallet_balance || u.walletBalance || 0, trustScore: u.trust_score || u.trustScore || 0, isVerified: !!u.is_verified || !!u.isVerified, isAdmin: !!u.is_admin || !!u.isAdmin, isTrusted: !!u.is_trusted || !!u.isTrusted, isDeactivated: !!u.is_deactivated || !!u.isDeactivated, joinDate: u.join_date || u.joinDate || '', gender: u.gender || 'male', showPhone: !!u.show_phone || !!u.showPhone, dateOfBirth: u.date_of_birth || u.dateOfBirth || '', interests: (() => { try { return JSON.parse(u.interests || '[]'); } catch { return []; } })() }))); } catch {} };
  const loadReports = async () => { try { const data = await adminFetch('GET', '/admin/reports').catch(() => []); if (Array.isArray(data)) setReports(data.map((r: any) => ({ id: r.id, postId: r.post_id, userId: r.user_id, reporterId: r.reporter_id || '', reporterName: r.reporter_name || 'مجهول', reason: r.reason || '', postContent: r.post_content, userName: r.user_name, status: r.status || 'pending', createdAt: r.created_at || '' }))); } catch {} };
  const loadSettings = async () => { try { const data = await adminFetch('GET', '/admin/settings').catch(() => null); if (data && typeof data === 'object') setSiteSettings(prev => ({ ...prev, ...(data as any), maintenanceMode: !!(data as any).maintenanceMode, maxUploadSize: (data as any).maxUploadSize || 5, defaultWalletBalance: (data as any).defaultWalletBalance || 0, siteName: (data as any).siteName || 'نواقص' })); } catch {} };
  const loadCategories = async () => { try { const data = await api.getCategories().catch(() => []); if (Array.isArray(data)) setAllCategories(data as any[]); } catch {} };
  const loadNews = async () => { try { const data = await api.getNews().catch(() => []); if (Array.isArray(data)) setAllNews(data as any[]); } catch {} };
  const loadTransactions = async () => { try { const params = new URLSearchParams({ page: String(txPage), limit: '50' }); if (txFilter !== 'all') params.set('type', txFilter); const data = await adminFetch('GET', `/admin/transactions?${params.toString()}`).catch(() => ({ transactions: [], total: 0 })); if (data && (data as any).transactions) { setTransactions((data as any).transactions); setTxTotal((data as any).total || 0); } } catch {} };
  const loadStories = async () => { try { const data = await adminFetch('GET', '/admin/stories').catch(() => []); if (Array.isArray(data)) setAdminStories(data.map((s: any) => ({ id: s.id, user_id: s.user_id, user_name: s.user_name || 'مجهول', user_avatar: s.user_avatar || '', image: s.image || '', type: s.type || 'image', text: s.text || '', created_at: s.created_at || '' }))); } catch {} };
  const loadChatMessages = async () => { try { const data = await adminFetch('GET', '/admin/chat-messages?limit=200').catch(() => []); if (Array.isArray(data)) setChatMessages(data.map((m: any) => ({ id: m.id, sender_id: m.sender_id, receiver_id: m.receiver_id, text: m.text || m.content || '', sender_name: m.sender_name || 'مجهول', receiver_name: m.receiver_name || 'مجهول', created_at: m.created_at || '' }))); } catch {} };
  const loadActivityLog = async () => { try { const data = await adminFetch('GET', '/admin/activity-log?limit=100').catch(() => []); if (Array.isArray(data)) setActivityLog(data as ActivityItem[]); } catch {} };
  const loadDatabaseInfo = async () => { try { const data = await adminFetch('GET', '/admin/database-info').catch(() => null); if (data) setDbInfo(data as DatabaseInfo); } catch {} };
  const loadComments = async () => { try { const data = await adminFetch('GET', '/admin/comments?limit=200').catch(() => []); if (Array.isArray(data)) setAdminComments(data as CommentItem[]); } catch {} };
  const loadSmartLinks = async () => { try { const data = await adminFetch('GET', '/admin/smart-links').catch(() => null); if (data) setSmartLinksData(data); } catch {} };
  const loadRealtimeStats = async () => { try { const data = await adminFetch('GET', '/admin/dashboard/realtime').catch(() => null); if (data) setRealtimeStats(data); } catch {} };
  const loadUserDetail = async (userId: string) => { try { const data = await adminFetch('GET', `/admin/user-details/${userId}`); setUserDetail(data); } catch { setUserDetail(null); } };

  // ─── Handlers ──
  const handleAddAlert = async () => { if (!alertTitle.trim()) { toast.error('أدخل عنوان التنبيه'); return; } try { const result = await api.createAlert(alertTitle.trim(), alertContent.trim() || alertTitle.trim(), alertSource); const newAlert: NewsItem = { id: result?.id || `alert_${Date.now()}`, title: alertTitle.trim(), content: alertContent.trim() || alertTitle.trim(), source: alertSource, isAlert, category: alertCategory, createdAt: new Date().toISOString() }; addAdminAlert(newAlert); setAlertTitle(''); setAlertContent(''); toast.success('تم إضافة التنبيه بنجاح'); refreshData(); loadNews(); } catch { toast.error('فشل إضافة التنبيه'); } };
  const handleDeleteUser = async (userId: string) => { if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return; try { await api.deleteUser(userId); loadUsers(); toast.success('تم حذف المستخدم'); } catch { toast.error('فشل حذف المستخدم'); } };
  const toggleVerify = async (userId: string) => { try { await api.toggleUserVerification(userId); loadUsers(); toast.success('تم تحديث حالة التوثيق'); } catch { toast.error('فشل تحديث التوثيق'); } };
  const toggleAdmin = async (userId: string) => { try { await adminFetch('PATCH', `/admin/users/${userId}/toggle-admin`); loadUsers(); toast.success('تم تحديث صلاحيات المدير'); } catch { toast.error('فشل تحديث الصلاحيات'); } };
  const toggleActive = async (userId: string) => { try { await adminFetch('PATCH', `/admin/users/${userId}/toggle-active`); loadUsers(); toast.success('تم تحديث حالة الحساب'); } catch { toast.error('فشل تحديث حالة الحساب'); } };
  const toggleTrusted = async (userId: string) => { try { await adminFetch('PATCH', `/admin/users/${userId}/toggle-trusted`); loadUsers(); toast.success('تم تحديث حالة الموثوق'); } catch { toast.error('فشل تحديث الموثوق'); } };
  const sendWarning = async (userId: string) => { try { await adminFetch('POST', `/admin/users/${userId}/send-warning`, { reason: warningReason || '' }); setWarningReason(''); toast.success('تم إرسال التحذير'); } catch { toast.error('فشل إرسال التحذير'); } };
  const adjustWallet = async (userId: string) => { const amount = parseFloat(walletAmount); if (isNaN(amount) || amount === 0) { toast.error('أدخل مبلغ صحيح'); return; } try { await adminFetch('POST', `/admin/users/${userId}/adjust-wallet`, { amount, reason: walletReason || 'تعديل يدوي من المدير' }); loadUsers(); setWalletAmount(''); setWalletReason(''); toast.success(`تم تعديل المحفظة بمبلغ ${amount > 0 ? '+' : ''}${amount} ج.م`); } catch { toast.error('فشل تعديل المحفظة'); } };
  const deletePost = async (postId: string) => { if (!confirm('هل أنت متأكد من حذف هذا المنشور؟')) return; try { await api.deletePost(postId); setPosts(prev => prev.filter((p: any) => p.id !== postId)); toast.success('تم حذف المنشور'); } catch { toast.error('فشل حذف المنشور'); } };
  const featurePostHandler = async (postId: string) => { try { await adminFetch('PUT', `/admin/posts/${postId}/feature`); setPosts(prev => prev.map((p: any) => p.id === postId ? { ...p, is_featured: true } : p)); toast.success('تم تمييز المنشور'); } catch { toast.error('فشل تمييز المنشور'); } };
  const removeFeature = async (postId: string) => { try { await adminFetch('DELETE', `/admin/posts/${postId}/feature`); setPosts(prev => prev.map((p: any) => p.id === postId ? { ...p, is_featured: false } : p)); toast.success('تم إزالة التمييز'); } catch { toast.error('فشل إزالة التمييز'); } };
  const flagPostHandler = async (postId: string) => { try { await adminFetch('PATCH', `/admin/posts/${postId}/flag`); setPosts(prev => prev.map((p: any) => p.id === postId ? { ...p, status: 'flagged' } : p)); toast.success('تم وضع علامة على المنشور'); } catch { toast.error('فشل وضع العلامة'); } };
  const dismissReport = async (reportId: string) => { try { await adminFetch('DELETE', `/admin/reports/${reportId}/dismiss`); setReports(prev => prev.filter(r => r.id !== reportId)); toast.success('تم رفض البلاغ'); } catch { toast.error('فشل رفض البلاغ'); } };
  const reportAction = async (reportId: string, action: string) => { try { await adminFetch('POST', `/admin/reports/${reportId}/action`, { action }); setReports(prev => prev.filter(r => r.id !== reportId)); toast.success('تم تنفيذ الإجراء'); } catch { toast.error('فشل تنفيذ الإجراء'); } };
  const addCategoryHandler = async () => { if (!catName.trim()) { toast.error('أدخل اسم الفئة'); return; } try { await adminFetch('POST', '/admin/categories', { name: catName.trim(), icon: catIcon.trim() || '📁' }); setCatName(''); setCatIcon(''); loadCategories(); toast.success('تم إضافة الفئة'); } catch { toast.error('فشل إضافة الفئة'); } };
  const updateCategoryHandler = async (catId: string) => { if (!catName.trim()) { toast.error('أدخل اسم الفئة'); return; } try { await adminFetch('PUT', `/admin/categories/${catId}`, { name: catName.trim(), icon: catIcon.trim() || '📁' }); setCatName(''); setCatIcon(''); setEditingCatId(null); loadCategories(); toast.success('تم تحديث الفئة'); } catch { toast.error('فشل تحديث الفئة'); } };
  const deleteCategoryHandler = async (catId: string) => { if (!confirm('هل أنت متأكد من حذف هذه الفئة؟')) return; try { await adminFetch('DELETE', `/admin/categories/${catId}`); loadCategories(); toast.success('تم حذف الفئة'); } catch { toast.error('فشل حذف الفئة'); } };
  const saveSettings = async () => { try { await adminFetch('PUT', '/admin/settings', { siteName: siteSettings.siteName, maintenanceMode: siteSettings.maintenanceMode, maxUploadSize: siteSettings.maxUploadSize, defaultWalletBalance: siteSettings.defaultWalletBalance }); toast.success('تم حفظ الإعدادات بنجاح'); } catch { toast.error('فشل حفظ الإعدادات'); } };
  const handlePublishPost = async () => { if (!adminPostContent.trim()) { toast.error('أدخل محتوى المنشور'); return; } try { const postData: any = { content: adminPostContent.trim(), type: adminPostType, image: adminPostImage || undefined, isPromoted: adminPostPromoted }; if (adminPostType === 'ad') { postData.price = parseFloat(adminPostPrice) || 0; postData.location = adminPostLocation; postData.category = adminPostCategory; } await api.createPost(postData); setAdminPostContent(''); setAdminPostImage(''); setAdminPostPrice(''); setAdminPostLocation(''); setAdminPostCategory(''); setAdminPostPromoted(false); toast.success('تم نشر المنشور بنجاح'); refreshData(); } catch { toast.error('فشل نشر المنشور'); } };
  const handleAddNews = async () => { if (!newsForm.title.trim()) { toast.error('أدخل عنوان الخبر'); return; } try { await adminFetch('POST', '/admin/news', { title: newsForm.title.trim(), content: newsForm.content.trim(), source: newsForm.source.trim() || 'نواقص', category: newsForm.category, isAlert: newsForm.isAlert }); setNewsForm({ title: '', content: '', source: 'نواقص', category: 'general', isAlert: false }); loadNews(); toast.success('تم إضافة الخبر'); refreshData(); } catch { toast.error('فشل إضافة الخبر'); } };
  const handleUpdateNews = async (newsId: string) => { if (!newsForm.title.trim()) { toast.error('أدخل عنوان الخبر'); return; } try { await adminFetch('PUT', `/admin/news/${newsId}`, { title: newsForm.title.trim(), content: newsForm.content.trim(), source: newsForm.source.trim(), category: newsForm.category, isAlert: newsForm.isAlert }); setEditingNewsId(null); setNewsForm({ title: '', content: '', source: 'نواقص', category: 'general', isAlert: false }); loadNews(); toast.success('تم تحديث الخبر'); refreshData(); } catch { toast.error('فشل تحديث الخبر'); } };
  const handleDeleteNews = async (newsId: string) => { if (!confirm('هل أنت متأكد من حذف هذا الخبر؟')) return; try { await adminFetch('DELETE', `/admin/news/${newsId}`); loadNews(); toast.success('تم حذف الخبر'); refreshData(); } catch { toast.error('فشل حذف الخبر'); } };
  const handleDeleteStory = async (storyId: string) => { if (!confirm('هل أنت متأكد من حذف هذه القصة؟')) return; try { await adminFetch('DELETE', `/admin/stories/${storyId}`); setAdminStories(prev => prev.filter(s => s.id !== storyId)); toast.success('تم حذف القصة'); } catch { toast.error('فشل حذف القصة'); } };
  const handleDeleteMessage = async (msgId: string) => { if (!confirm('هل أنت متأكد من حذف هذه الرسالة؟')) return; try { await adminFetch('DELETE', `/admin/chat-messages/${msgId}`); setChatMessages(prev => prev.filter(m => m.id !== msgId)); toast.success('تم حذف الرسالة'); } catch { toast.error('فشل حذف الرسالة'); } };
  const handleDeleteComment = async (commentId: string) => { if (!confirm('هل أنت متأكد من حذف هذا التعليق؟')) return; try { await adminFetch('DELETE', `/admin/comments/${commentId}`); setAdminComments(prev => prev.filter(c => c.id !== commentId)); toast.success('تم حذف التعليق'); } catch { toast.error('فشل حذف التعليق'); } };
  const handleBroadcast = async () => { if (!broadcastMessage.trim()) { toast.error('أدخل نص الرسالة'); return; } setBroadcastSending(true); try { const result = await adminFetch('POST', '/admin/broadcast', { title: broadcastTitle.trim(), message: broadcastMessage.trim(), type: broadcastType }); toast.success(`تم إرسال الإشعار إلى ${(result as any).count || 0} مستخدم`); setBroadcastTitle(''); setBroadcastMessage(''); } catch { toast.error('فشل إرسال الإشعار'); } finally { setBroadcastSending(false); } };
  const handleCleanup = async (action: string) => { setCleanupRunning(true); try { const result = await adminFetch('POST', '/admin/cleanup', { action }); toast.success((result as any).message || 'تمت عملية التنظيف'); loadDatabaseInfo(); } catch { toast.error('فشلت عملية التنظيف'); } finally { setCleanupRunning(false); } };

  const approveMarketPromo = async (id: string) => {
    try {
      await api.approveMarketPromotion(id);
      setMarketPromoRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' } : r));
      toast.success('تم الموافقة على ترويج السوق');
    } catch (err: any) {
      toast.error(err.message || 'فشل الموافقة على الترويج');
    }
  };
  const rejectMarketPromo = async (id: string) => {
    try {
      await api.rejectMarketPromotion(id);
      setMarketPromoRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'rejected' } : r));
      toast.success('تم رفض ترويج السوق');
    } catch (err: any) {
      toast.error(err.message || 'فشل رفض الترويج');
    }
  };

  // ─── Computed ──
  const defaultStats: DashboardStats = stats || { totalUsers: 0, activeAds: 0, totalTransactions: 0, dailyGrowth: 0, revenue: 0 };
  const defaultChart = chartData.length > 0 ? chartData : [
    { name: 'السبت', ads: 400 }, { name: 'الأحد', ads: 300 }, { name: 'الاثنين', ads: 200 },
    { name: 'الثلاثاء', ads: 278 }, { name: 'الأربعاء', ads: 189 }, { name: 'الخميس', ads: 239 }, { name: 'الجمعة', ads: 349 },
  ];
  const filteredUsers = useMemo(() => { let r = allUsers.filter(u => u.name.includes(searchQuery) || u.email.includes(searchQuery) || u.phone?.includes(searchQuery)); if (userFilter === 'verified') r = r.filter(u => u.isVerified); if (userFilter === 'admin') r = r.filter(u => u.isAdmin); if (userFilter === 'deactivated') r = r.filter(u => u.isDeactivated); if (userFilter === 'trusted') r = r.filter(u => u.isTrusted); if (userSort === 'name') r.sort((a, b) => a.name.localeCompare(b.name, 'ar')); if (userSort === 'wallet') r.sort((a, b) => b.walletBalance - a.walletBalance); if (userSort === 'trust') r.sort((a, b) => b.trustScore - a.trustScore); return r; }, [allUsers, searchQuery, userFilter, userSort]);
  const filteredPosts = useMemo(() => { let r = posts.filter((p: any) => p.content?.includes(postSearch) || p.author_name?.includes(postSearch)); if (postStatusFilter !== 'all') r = r.filter((p: any) => p.status === postStatusFilter); if (postTypeFilter === 'support') r = r.filter((p: any) => p.category === 'support_ticket'); else if (postTypeFilter === 'complaint') r = r.filter((p: any) => p.category?.startsWith('complaint_')); else if (postTypeFilter !== 'all') r = r.filter((p: any) => p.type === postTypeFilter); return r; }, [posts, postSearch, postStatusFilter, postTypeFilter]);
  const filteredCharging = useMemo(() => chargingFilter === 'all' ? chargingRequests : chargingRequests.filter(c => c.status === chargingFilter), [chargingRequests, chargingFilter]);
  const filteredPromos = useMemo(() => promoFilter === 'all' ? promotionRequests : promotionRequests.filter(p => p.status === promoFilter), [promotionRequests, promoFilter]);
  const filteredMarketPromos = useMemo(() => marketPromoFilter === 'all' ? marketPromoRequests : marketPromoRequests.filter(p => p.status === marketPromoFilter), [marketPromoRequests, marketPromoFilter]);
  const filteredNews = useMemo(() => newsFilter === 'all' ? allNews : allNews.filter((n: any) => n.category === newsFilter || ((n as any).is_alert && newsFilter === 'urgent')), [allNews, newsFilter]);
  const typePieData = useMemo(() => { return [{ name: 'إعلانات', value: posts.filter((p: any) => p.type === 'ad').length }, { name: 'أخبار', value: posts.filter((p: any) => p.type === 'news').length }, { name: 'حالات', value: posts.filter((p: any) => p.type === 'status').length }].filter(d => d.value > 0); }, [posts]);
  const filteredMessages = useMemo(() => !msgSearch ? chatMessages : chatMessages.filter(m => m.text?.includes(msgSearch) || m.sender_name?.includes(msgSearch) || m.receiver_name?.includes(msgSearch)), [chatMessages, msgSearch]);
  const filteredComments = useMemo(() => !commentSearch ? adminComments : adminComments.filter(c => c.content?.includes(commentSearch) || c.author_name?.includes(commentSearch)), [adminComments, commentSearch]);

  // ─── Sidebar Config ──
  const tabs: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview', label: 'نظرة عامة', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'users', label: 'المستخدمون', icon: <Users className="w-5 h-5" />, badge: allUsers.length },
    { id: 'posts', label: 'المنشورات', icon: <Package className="w-5 h-5" />, badge: posts.length },
    { id: 'support', label: 'الدعم والشكاوى', icon: <PhoneIcon className="w-5 h-5" />, badge: posts.filter((p: any) => p.category === 'support_ticket' || p.category?.startsWith('complaint_')).length },
    { id: 'comments', label: 'التعليقات', icon: <MessageCircle className="w-5 h-5" /> },
    { id: 'charging', label: 'طلبات الشحن', icon: <CreditCard className="w-5 h-5" />, badge: chargingRequests.filter(c => c.status === 'pending').length },
    { id: 'promotions', label: 'طلبات الترويج', icon: <Zap className="w-5 h-5" />, badge: promotionRequests.filter(p => p.status === 'pending').length },
    { id: 'market-promotions', label: 'ترويج السوق', icon: <ShoppingBag className="w-5 h-5" />, badge: marketPromoRequests.filter(p => p.status === 'pending').length },
    { id: 'market-listings', label: 'إعلانات السوق', icon: <Package className="w-5 h-5" /> },
    { id: 'news', label: 'الأخبار والتنبيهات', icon: <Newspaper className="w-5 h-5" />, badge: allNews.length },
    { id: 'publish', label: 'نشر كمسؤول', icon: <Plus className="w-5 h-5" /> },
    { id: 'reports', label: 'البلاغات', icon: <Flag className="w-5 h-5" />, badge: reports.length },
    { id: 'categories', label: 'الفئات', icon: <BarChart3 className="w-5 h-5" />, badge: allCategories.length },
    { id: 'transactions', label: 'المعاملات المالية', icon: <Wallet className="w-5 h-5" /> },
    { id: 'stories', label: 'القصص', icon: <ImageIcon className="w-5 h-5" /> },
    { id: 'messages', label: 'الرسائل', icon: <MessageSquare className="w-5 h-5" /> },
    { id: 'smartlinks', label: 'الوصل الذكي', icon: <Link2 className="w-5 h-5" /> },
    { id: 'activity', label: 'سجل النشاط', icon: <Activity className="w-5 h-5" /> },
    { id: 'broadcast', label: 'إشعارات جماعية', icon: <Radio className="w-5 h-5" /> },
    { id: 'database', label: 'قاعدة البيانات', icon: <Database className="w-5 h-5" /> },
    { id: 'settings', label: 'الإعدادات', icon: <Settings className="w-5 h-5" /> },
  ];

  // ─── Loading ──
  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`} dir="rtl">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className={`font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>جارٍ تحميل لوحة التحكم...</p>
        </div>
      </div>
    );
  }

  // ─── Render ──
  return (
    <div className={`min-h-screen flex ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`} dir={dir}>
      {/* ─── Sidebar ─── */}
      <aside className={`${sidebarCollapsed ? 'w-16' : 'w-56'} ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-l flex flex-col transition-all duration-300 sticky top-0 h-screen overflow-hidden shrink-0`}>
        <div className={`p-3 border-b flex items-center gap-2 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <button onClick={() => navigate('/')} className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0 ${darkMode ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            <ChevronRight className="w-4 h-4" />
          </button>
          {!sidebarCollapsed && (
            <h1 className={`text-sm font-black flex items-center gap-1.5 truncate ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center text-white shrink-0"><LayoutDashboard className="w-4 h-4" /></div>
              لوحة التحكم
            </h1>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto py-2 px-1.5 space-y-0.5 custom-scrollbar">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === tab.id ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-50'} ${sidebarCollapsed ? 'justify-center' : ''}`}
              title={tab.label}>
              <span className={`shrink-0 ${activeTab === tab.id ? 'text-white' : 'text-gray-400'}`}>{tab.icon}</span>
              {!sidebarCollapsed && (<><span className="truncate flex-1 text-start">{tab.label}</span>{tab.badge ? <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-600'}`}>{tab.badge}</span> : null}</>)}
            </button>
          ))}
        </nav>
        <div className={`p-2 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className={`w-full flex items-center justify-center gap-2 px-2 py-2 rounded-xl transition-colors ${darkMode ? 'text-gray-500 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-50'}`}>
            {sidebarCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {!sidebarCollapsed && <span className="text-[10px] font-bold">طي القائمة</span>}
          </button>
        </div>
        <div className={`p-2 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className="flex items-center gap-2 px-2 py-1.5">
            {currentUser && <img src={currentUser.avatarBase64 || currentUser.avatar} alt="" className="w-8 h-8 rounded-full border-2 border-orange-200 shrink-0" />}
            {!sidebarCollapsed && (<div className="min-w-0"><p className={`text-[10px] font-bold truncate ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{currentUser?.name}</p><span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${darkMode ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-600'}`}>مدير</span></div>)}
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <header className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} border-b sticky top-0 z-40 px-6 py-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className={`lg:hidden w-9 h-9 rounded-xl flex items-center justify-center ${darkMode ? 'bg-gray-700 text-gray-400' : darkMode ? "'bg-gray-700 text-gray-400'" : "'bg-gray-100 text-gray-500'"}`}><Menu className="w-5 h-5" /></button>
              <h2 className={`text-lg font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{tabs.find(t => t.id === activeTab)?.label || 'لوحة التحكم'}</h2>
            </div>
            <button onClick={refreshData} className={`flex items-center gap-1.5 text-xs font-bold transition-colors ${darkMode ? 'text-gray-400 hover:text-orange-400' : 'text-gray-500 hover:text-orange-500'}`}><RefreshCw className="w-4 h-4" />تحديث</button>
          </div>
        </header>

        <div className="p-4 md:p-6 max-w-7xl">

          {/* ═══════ TAB 1: OVERVIEW ═══════ */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <StatCard darkMode={darkMode} icon={<Users className="w-5 h-5" />} label="المستخدمون" value={detailedStats?.totalUsers || defaultStats.totalUsers} trend="+12%" />
                <StatCard darkMode={darkMode} icon={<CheckCircle className="w-5 h-5" />} label="المنشورات النشطة" value={detailedStats?.activeAds || defaultStats.activeAds} color="#10b981" />
                <StatCard darkMode={darkMode} icon={<DollarSign className="w-5 h-5" />} label="الإيرادات" value={`${detailedStats?.totalRevenue || defaultStats.revenue} ج.م`} color="#8b5cf6" />
                <StatCard darkMode={darkMode} icon={<CreditCard className="w-5 h-5" />} label="طلبات الشحن" value={detailedStats?.pendingCharging || 0} trend="pending" color="#f59e0b" />
                <StatCard darkMode={darkMode} icon={<Zap className="w-5 h-5" />} label="طلبات الترويج" value={detailedStats?.pendingPromotions || 0} color="#06b6d4" />
                <StatCard darkMode={darkMode} icon={<Shield className="w-5 h-5" />} label="منشورات موضع علامة" value={detailedStats?.flaggedPosts || 0} color="#ef4444" />
                <StatCard darkMode={darkMode} icon={<Wallet className="w-5 h-5" />} label="رصيد المحافظ" value={`${detailedStats?.totalWalletBalance || 0} ج.م`} color="#ec4899" />
                <StatCard darkMode={darkMode} icon={<Star className="w-5 h-5" />} label="المستخدمون الموثوقون" value={detailedStats?.verifiedUsers || 0} color="#f59e0b" />
              </div>

              {/* Realtime Stats */}
              {realtimeStats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-4 text-white">
                    <p className="text-[11px] opacity-80 mb-1">متصل الآن</p>
                    <p className="text-2xl font-black">{realtimeStats.onlineUsers}</p>
                  </div>
                  <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-4 text-white">
                    <p className="text-[11px] opacity-80 mb-1">منشورات اليوم</p>
                    <p className="text-2xl font-black">{realtimeStats.newPostsToday}</p>
                  </div>
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white">
                    <p className="text-[11px] opacity-80 mb-1">مستخدمون جدد اليوم</p>
                    <p className="text-2xl font-black">{realtimeStats.newUsersToday}</p>
                  </div>
                  <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-4 text-white">
                    <p className="text-[11px] opacity-80 mb-1">عناصر معلقة</p>
                    <p className="text-2xl font-black">{realtimeStats.pendingItems}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Section darkMode={darkMode} title="النشاط الأسبوعي" icon={<BarChart3 className="w-5 h-5" />}>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={defaultChart}>
                      <defs><linearGradient id="colorAds" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={ORANGE} stopOpacity={0.3} /><stop offset="95%" stopColor={ORANGE} stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#f3f4f6'} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: darkMode ? '#9ca3af' : '#9ca3af' }} />
                      <YAxis tick={{ fontSize: 11, fill: darkMode ? '#9ca3af' : '#9ca3af' }} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: darkMode ? '1px solid #374151' : '1px solid #f3f4f6', fontSize: 12, background: darkMode ? '#1f2937' : '#fff', color: darkMode ? '#fff' : '#000' }} />
                      <Area type="monotone" dataKey="ads" stroke={ORANGE} fill="url(#colorAds)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Section>

                <Section darkMode={darkMode} title="أنواع المنشورات" icon={<PieChart className="w-5 h-5" />}>
                  {typePieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart><Pie data={typePieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value" label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>{typePieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Tooltip contentStyle={{ borderRadius: 12, border: darkMode ? '1px solid #374151' : '1px solid #f3f4f6', fontSize: 12, background: darkMode ? '#1f2937' : '#fff', color: darkMode ? '#fff' : '#000' }} /></PieChart>
                    </ResponsiveContainer>
                  ) : <EmptyState darkMode={darkMode} icon={<BarChart3 className="w-12 h-12" />} text="لا توجد منشورات بعد" />}
                </Section>
              </div>

              {/* Recent Activity */}
              <Section darkMode={darkMode} title="النشاط الأخير" icon={<Activity className="w-5 h-5" />} action={<Btn darkMode={darkMode} onClick={loadRealtimeStats}><RefreshCw className="w-3.5 h-3.5" /></Btn>}>
                {realtimeStats?.recentActivity?.length > 0 ? (
                  <div className="space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
                    {realtimeStats.recentActivity.map((item: any, i: number) => (
                      <div key={i} className={`flex items-center gap-3 p-2 rounded-xl transition-colors ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.type === 'user' ? 'bg-green-50 text-green-500' : item.type === 'post' ? 'bg-blue-50 text-blue-500' : 'bg-purple-50 text-purple-500'}`}>
                          {item.type === 'user' ? <Users className="w-4 h-4" /> : item.type === 'post' ? <Package className="w-4 h-4" /> : <DollarSign className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0"><p className={`text-xs font-medium truncate ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{item.description}</p><p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{item.created_at ? formatTimeAgo(item.created_at) : ''}</p></div>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState darkMode={darkMode} icon={<Activity className="w-12 h-12" />} text="لا يوجد نشاط حديث" />}
              </Section>
            </div>
          )}

          {/* ═══════ TAB 2: USERS ═══════ */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-300" /><input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="بحث بالاسم أو البريد..." className={`w-full pr-10 pl-4 py-2 rounded-xl border text-sm focus:outline-none focus:border-orange-300 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-200'}`} /></div>
                <select value={userFilter} onChange={e => setUserFilter(e.target.value as any)} className={`px-3 py-2 rounded-xl border text-xs font-bold focus:outline-none ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'border-gray-200 text-gray-600'}`}>
                  <option value="all">الكل</option><option value="verified">موثقون</option><option value="admin">مديرون</option><option value="deactivated">معطلون</option><option value="trusted">موثوقون</option>
                </select>
                <select value={userSort} onChange={e => setUserSort(e.target.value as any)} className={`px-3 py-2 rounded-xl border text-xs font-bold focus:outline-none ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'border-gray-200 text-gray-600'}`}>
                  <option value="joinDate">تاريخ الانضمام</option><option value="name">الاسم</option><option value="wallet">المحفظة</option><option value="trust">نقاط الثقة</option>
                </select>
              </div>
              <div className="grid gap-3 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
                {filteredUsers.map(u => (
                  <div key={u.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-4 hover:shadow-md transition-all`}>
                    <div className="flex items-start gap-3">
                      <img src={u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`} alt="" className="w-11 h-11 rounded-xl shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{u.name}</span>
                          {u.isVerified && <Badge darkMode={darkMode} color="green">موثق</Badge>}
                          {u.isAdmin && <Badge darkMode={darkMode} color="orange">مدير</Badge>}
                          {u.isTrusted && <Badge darkMode={darkMode} color="purple">موثوق</Badge>}
                          {u.isDeactivated && <Badge darkMode={darkMode} color="red">معطل</Badge>}
                        </div>
                        <p className={`text-[11px] mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{u.email}</p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {u.phone && <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${darkMode ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-600'}`}><Info className="w-2.5 h-2.5" />{u.phone}</span>}
                          {u.dateOfBirth && (() => {
                            const birthDate = new Date(u.dateOfBirth);
                            const today = new Date();
                            let age = today.getFullYear() - birthDate.getFullYear();
                            const m = today.getMonth() - birthDate.getMonth();
                            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
                            return age > 0 ? <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${darkMode ? 'bg-purple-900/40 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>عمر {age} سنة</span> : null;
                          })()}
                          {u.gender && u.gender !== 'male' && <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${darkMode ? 'bg-pink-900/40 text-pink-400' : 'bg-pink-50 text-pink-600'}`}>أنثى</span>}
                        </div>
                        <div className={`flex items-center gap-4 mt-1.5 text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          <span className="flex items-center gap-1"><Wallet className="w-3 h-3" />{u.walletBalance} ج.م</span>
                          <span className="flex items-center gap-1"><Star className="w-3 h-3" />{u.trustScore}</span>
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{u.joinDate ? formatTimeAgo(u.joinDate) : '-'}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        <Btn darkMode={darkMode} size="xs" variant="outline" onClick={() => { setSelectedUser(u); loadUserDetail(u.id); setShowUserModal(true); }}><Eye className="w-3 h-3" /></Btn>
                        <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => toggleVerify(u.id)}><UserCheck className="w-3 h-3" /></Btn>
                        <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => toggleTrusted(u.id)}><Star className="w-3 h-3" /></Btn>
                        <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => toggleAdmin(u.id)}><Shield className="w-3 h-3" /></Btn>
                        <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => toggleActive(u.id)}>{u.isDeactivated ? <Check className="w-3 h-3" /> : <Ban className="w-3 h-3" />}</Btn>
                        <Btn darkMode={darkMode} size="xs" variant="danger" onClick={() => handleDeleteUser(u.id)}><Trash2 className="w-3 h-3" /></Btn>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredUsers.length === 0 && <EmptyState darkMode={darkMode} icon={<Users className="w-12 h-12" />} text="لا يوجد مستخدمون" />}
              </div>

              {/* User Detail Modal */}
              {showUserModal && selectedUser && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowUserModal(false)}>
                  <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
                    <div className={`p-5 border-b flex items-center justify-between ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                      <h3 className={`font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>تفاصيل المستخدم</h3>
                      <button onClick={() => setShowUserModal(false)} className={`transition-colors ${darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}><CloseIcon className="w-5 h-5" /></button>
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="flex items-center gap-3">
                        <img src={selectedUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedUser.id}`} alt="" className="w-14 h-14 rounded-xl" />
                        <div>
                          <p className={`font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{selectedUser.name}</p>
                          <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{selectedUser.email}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {selectedUser.phone && <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${darkMode ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>📱 {selectedUser.phone}</span>}
                            {selectedUser.dateOfBirth && (() => {
                              const birthDate = new Date(selectedUser.dateOfBirth);
                              const today = new Date();
                              let age = today.getFullYear() - birthDate.getFullYear();
                              const m = today.getMonth() - birthDate.getMonth();
                              if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
                              return age > 0 ? <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${darkMode ? 'bg-purple-900/40 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>🎂 عمر {age} سنة</span> : null;
                            })()}
                            {selectedUser.gender && <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-50 text-gray-600'}`}>{selectedUser.gender === 'female' ? '♀ أنثى' : '♂ ذكر'}</span>}
                          </div>
                        </div>
                      </div>
                      {userDetail?.stats && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-xl p-3`}><p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>المنشورات</p><p className={`font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{userDetail.stats.postsCount}</p></div>
                          <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-xl p-3`}><p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>التعليقات</p><p className={`font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{userDetail.stats.commentsCount}</p></div>
                          <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-xl p-3`}><p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>الأصدقاء</p><p className={`font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{userDetail.stats.friendsCount}</p></div>
                          <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-xl p-3`}><p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>إشعارات غير مقروءة</p><p className={`font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{userDetail.stats.unreadNotifications}</p></div>
                        </div>
                      )}
                      {/* Wallet Adjustment */}
                      <div className={`border rounded-xl p-4 space-y-3 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                        <h4 className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>تعديل المحفظة</h4>
                        <div className="flex gap-2">
                          <input value={walletAmount} onChange={e => setWalletAmount(e.target.value)} type="number" placeholder="المبلغ" className={`flex-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
                          <input value={walletReason} onChange={e => setWalletReason(e.target.value)} placeholder="السبب" className={`flex-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
                          <Btn darkMode={darkMode} variant="primary" onClick={() => adjustWallet(selectedUser.id)}>تعديل</Btn>
                        </div>
                      </div>
                      {/* Send Warning */}
                      <div className={`border rounded-xl p-4 space-y-3 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                        <h4 className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>إرسال تحذير</h4>
                        <div className="flex gap-2">
                          <input value={warningReason} onChange={e => setWarningReason(e.target.value)} placeholder="سبب التحذير" className={`flex-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
                          <Btn darkMode={darkMode} variant="danger" onClick={() => sendWarning(selectedUser.id)}>تحذير</Btn>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════ TAB 3: POSTS ═══════ */}
          {activeTab === 'posts' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-300" /><input value={postSearch} onChange={e => setPostSearch(e.target.value)} placeholder="بحث بالمحتوى أو الكاتب..." className={`w-full pr-10 pl-4 py-2 rounded-xl border text-sm focus:outline-none focus:border-orange-300 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-200'}`} /></div>
                <select value={postStatusFilter} onChange={e => setPostStatusFilter(e.target.value as any)} className={`px-3 py-2 rounded-xl border text-xs font-bold ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'border-gray-200'}`}><option value="all">كل الحالات</option><option value="active">نشط</option><option value="flagged">موضع علامة</option></select>
                <select value={postTypeFilter} onChange={e => setPostTypeFilter(e.target.value as any)} className={`px-3 py-2 rounded-xl border text-xs font-bold ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'border-gray-200'}`}><option value="all">كل الأنواع</option><option value="ad">إعلان</option><option value="news">خبر</option><option value="status">حالة</option><option value="support">دعم فني</option><option value="complaint">شكاوى</option></select>
              </div>
              <div className="grid gap-3 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
                {filteredPosts.map((p: any) => (
                  <div key={p.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-4`}>
                    <div className="flex items-start gap-3">
                      <img src={p.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.author_id}`} alt="" className="w-9 h-9 rounded-lg shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap"><span className={`font-bold text-xs ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{p.author_name || 'مجهول'}</span>{p.status === 'flagged' && <Badge darkMode={darkMode} color="red">موضع علامة</Badge>}{p.is_featured && <Badge darkMode={darkMode} color="orange">مميز</Badge>}{p.is_promoted && <Badge darkMode={darkMode} color="purple">مروّج</Badge>}<Badge darkMode={darkMode} color={p.type === 'ad' ? 'orange' : p.type === 'news' ? 'blue' : 'green'}>{p.type === 'ad' ? 'إعلان' : p.type === 'news' ? 'خبر' : 'حالة'}</Badge>{p.category === 'support_ticket' && <Badge darkMode={darkMode} color="blue">دعم فني</Badge>}{p.category?.startsWith('complaint_') && <Badge darkMode={darkMode} color="red">شكوى</Badge>}</div>
                        {/* Sender phone number - prominently displayed for support/complaint posts */}
                        {(p.sender_phone || p.author_phone) ? (
                          <div className={`mt-1.5 inline-flex items-center gap-1.5 border rounded-lg px-2.5 py-1 ${darkMode ? 'bg-blue-900/30 border-blue-700' : 'bg-blue-50 border-blue-200'}`}>
                            <PhoneIcon className="w-3.5 h-3.5 text-blue-600" />
                            <span className={`text-xs font-black dir-ltr ${darkMode ? 'text-blue-400' : 'text-blue-700'}`} dir="ltr">{p.sender_phone || p.author_phone}</span>
                            <a href={`tel:${p.sender_phone || p.author_phone}`} className="text-[9px] text-blue-500 hover:text-blue-700 underline">اتصال</a>
                          </div>
                        ) : (p.category === 'support_ticket' || p.category?.startsWith('complaint_')) && (
                          <div className={`mt-1.5 inline-flex items-center gap-1 border rounded-lg px-2.5 py-1 ${darkMode ? 'bg-red-900/30 border-red-700' : 'bg-red-50 border-red-200'}`}>
                            <span className={`text-[10px] font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>⚠️ لا يوجد رقم هاتف</span>
                          </div>
                        )}
                        <p className={`text-xs mt-1 line-clamp-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{p.content}</p>
                        <p className={`text-[10px] mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{p.created_at ? formatTimeAgo(p.created_at) : ''}</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {!p.is_featured && <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => featurePostHandler(p.id)} title="تمييز"><Star className="w-3 h-3" /></Btn>}
                        {p.is_featured && <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => removeFeature(p.id)} title="إزالة التمييز"><StarOff className="w-3 h-3" /></Btn>}
                        {p.status !== 'flagged' && <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => flagPostHandler(p.id)} title="وضع علامة"><Flag className="w-3 h-3" /></Btn>}
                        <Btn darkMode={darkMode} size="xs" variant="danger" onClick={() => deletePost(p.id)}><Trash2 className="w-3 h-3" /></Btn>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredPosts.length === 0 && <EmptyState darkMode={darkMode} icon={<Package className="w-12 h-12" />} text="لا توجد منشورات" />}
              </div>
            </div>
          )}

          {/* ═══════ TAB: SUPPORT & COMPLAINTS ═══════ */}
          {activeTab === 'support' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px]"><Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-300" /><input value={postSearch} onChange={e => setPostSearch(e.target.value)} placeholder="بحث بالمحتوى أو الكاتب أو رقم الهاتف..." className={`w-full pr-10 pl-4 py-2 rounded-xl border text-sm focus:outline-none focus:border-orange-300 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-200'}`} /></div>
                <select value={supportFilter} onChange={e => setSupportFilter(e.target.value as any)} className={`px-3 py-2 rounded-xl border text-xs font-bold ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'border-gray-200'}`}>
                  <option value="all">الكل ({posts.filter((p: any) => p.category === 'support_ticket' || p.category?.startsWith('complaint_')).length})</option>
                  <option value="support">دعم فني ({posts.filter((p: any) => p.category === 'support_ticket').length})</option>
                  <option value="complaint">شكاوى ({posts.filter((p: any) => p.category?.startsWith('complaint_')).length})</option>
                </select>
              </div>
              <div className="grid gap-3 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
                {posts
                  .filter((p: any) => {
                    if (supportFilter === 'support') return p.category === 'support_ticket';
                    if (supportFilter === 'complaint') return p.category?.startsWith('complaint_');
                    return p.category === 'support_ticket' || p.category?.startsWith('complaint_');
                  })
                  .filter((p: any) => !postSearch || p.content?.includes(postSearch) || p.author_name?.includes(postSearch) || p.sender_phone?.includes(postSearch) || p.author_phone?.includes(postSearch))
                  .map((p: any) => (
                  <div key={p.id} className={`rounded-2xl border p-4 ${p.category === 'support_ticket' ? (darkMode ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50/50 border-blue-200') : (darkMode ? 'bg-red-900/20 border-red-800' : 'bg-red-50/50 border-red-200')}`}>
                    <div className="flex items-start gap-3">
                      <img src={p.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.author_id}`} alt="" className="w-10 h-10 rounded-xl shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{p.author_name || 'مجهول'}</span>
                          {p.category === 'support_ticket' && <Badge darkMode={darkMode} color="blue">دعم فني</Badge>}
                          {p.category?.startsWith('complaint_') && <Badge darkMode={darkMode} color="red">شكوى</Badge>}
                          {p.category === 'complaint_user' && <Badge darkMode={darkMode} color="orange">مستخدم</Badge>}
                          {p.category === 'complaint_ad' && <Badge darkMode={darkMode} color="orange">إعلان</Badge>}
                          {p.category === 'complaint_payment' && <Badge darkMode={darkMode} color="green">دفع</Badge>}
                          {p.category === 'complaint_chat' && <Badge darkMode={darkMode} color="purple">محادثة</Badge>}
                          {p.category === 'complaint_other' && <Badge darkMode={darkMode} color="gray">أخرى</Badge>}
                        </div>
                        {/* Sender phone number - prominently displayed */}
                        {(p.sender_phone || p.author_phone) ? (
                          <div className={`mt-2 inline-flex items-center gap-2 border-2 rounded-xl px-3 py-1.5 shadow-sm ${darkMode ? 'bg-gray-700 border-blue-600' : 'bg-white border-blue-300'}`}>
                            <PhoneIcon className="w-4 h-4 text-blue-600" />
                            <span className={`text-sm font-black dir-ltr ${darkMode ? 'text-blue-400' : 'text-blue-700'}`} dir="ltr">{p.sender_phone || p.author_phone}</span>
                            <a href={`tel:${p.sender_phone || p.author_phone}`} className="text-[10px] text-white bg-blue-500 hover:bg-blue-600 px-2 py-0.5 rounded-lg font-bold transition-colors">اتصال</a>
                            <a href={`https://wa.me/${(p.sender_phone || p.author_phone).replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-white bg-green-500 hover:bg-green-600 px-2 py-0.5 rounded-lg font-bold transition-colors">واتساب</a>
                          </div>
                        ) : (
                          <div className={`mt-2 inline-flex items-center gap-1.5 border rounded-xl px-3 py-1.5 ${darkMode ? 'bg-red-900/30 border-red-700' : 'bg-red-100 border-red-300'}`}>
                            <PhoneIcon className="w-4 h-4 text-red-500" />
                            <span className={`text-xs font-bold ${darkMode ? 'text-red-400' : 'text-red-700'}`}>⚠️ لا يوجد رقم هاتف</span>
                          </div>
                        )}
                        <p className={`text-sm mt-2 whitespace-pre-wrap ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{p.content}</p>
                        {p.image && (
                          <div className="mt-2">
                            <img src={p.image} alt="مرفق" className={`max-w-[200px] max-h-[150px] rounded-xl border object-cover ${darkMode ? 'border-gray-600' : 'border-gray-200'}`} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          </div>
                        )}
                        <p className={`text-[10px] mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{p.created_at ? formatTimeAgo(p.created_at) : ''}</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Btn darkMode={darkMode} size="xs" variant="danger" onClick={() => deletePost(p.id)}><Trash2 className="w-3 h-3" /></Btn>
                      </div>
                    </div>
                  </div>
                ))}
                {posts.filter((p: any) => p.category === 'support_ticket' || p.category?.startsWith('complaint_')).length === 0 && <EmptyState darkMode={darkMode} icon={<PhoneIcon className="w-12 h-12" />} text="لا توجد رسائل دعم أو شكاوى" />}
              </div>
            </div>
          )}

          {/* ═══════ TAB 4: COMMENTS ═══════ */}
          {activeTab === 'comments' && (
            <div className="space-y-4">
              <div className="relative max-w-md"><Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-300" /><input value={commentSearch} onChange={e => setCommentSearch(e.target.value)} placeholder="بحث في التعليقات..." className={`w-full pr-10 pl-4 py-2 rounded-xl border text-sm focus:outline-none focus:border-orange-300 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-200'}`} /></div>
              <div className="grid gap-3 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
                {filteredComments.map(c => (
                  <div key={c.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-4`}>
                    <div className="flex items-start gap-3">
                      <img src={c.author_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.author_id}`} alt="" className="w-9 h-9 rounded-lg shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2"><span className={`font-bold text-xs ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{c.author_name}</span>{c.author_verified && <Badge darkMode={darkMode} color="green">موثق</Badge>}</div>
                        <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{c.content}</p>
                        {c.post_content && <p className={`text-[10px] mt-1 rounded-lg p-2 line-clamp-1 ${darkMode ? 'text-gray-500 bg-gray-700' : 'text-gray-300 bg-gray-50'}`}>على: {c.post_content}</p>}
                        <p className={`text-[10px] mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{c.created_at ? formatTimeAgo(c.created_at) : ''}</p>
                      </div>
                      <Btn darkMode={darkMode} size="xs" variant="danger" onClick={() => handleDeleteComment(c.id)}><Trash2 className="w-3 h-3" /></Btn>
                    </div>
                  </div>
                ))}
                {filteredComments.length === 0 && <EmptyState darkMode={darkMode} icon={<MessageCircle className="w-12 h-12" />} text="لا توجد تعليقات" />}
              </div>
            </div>
          )}

          {/* ═══════ TAB 5: CHARGING ═══════ */}
          {activeTab === 'charging' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 items-center">
                <select value={chargingFilter} onChange={e => setChargingFilter(e.target.value as any)} className={`px-3 py-2 rounded-xl border text-xs font-bold ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'border-gray-200'}`}>
                  <option value="all">الكل ({chargingRequests.length})</option><option value="pending">معلقة ({chargingRequests.filter(c => c.status === 'pending').length})</option><option value="approved">مقبولة</option><option value="rejected">مرفوضة</option>
                </select>
                <div className="flex gap-2 mr-auto"><Badge darkMode={darkMode} color="orange">معلقة: {chargingRequests.filter(c => c.status === 'pending').length}</Badge><Badge darkMode={darkMode} color="green">المبلغ المعلق: {chargingRequests.filter(c => c.status === 'pending').reduce((s, c) => s + c.amount, 0)} ج.م</Badge></div>
              </div>
              <div className="grid gap-3 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
                {filteredCharging.map(c => (
                  <div key={c.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-4`}>
                    <div className="flex items-start gap-3">
                      <img src={c.userAvatar} alt="" className="w-10 h-10 rounded-xl shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2"><span className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{c.userName}</span><Badge darkMode={darkMode} color={c.status === 'pending' ? 'orange' : c.status === 'approved' ? 'green' : 'red'}>{c.status === 'pending' ? 'معلق' : c.status === 'approved' ? 'مقبول' : 'مرفوض'}</Badge></div>
                        <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{c.amount} ج.م • {c.method}</p>
                        {/* Sender phone number - prominently displayed for transfer matching */}
                        {c.userPhone ? (
                          <div className={`mt-1.5 inline-flex items-center gap-1.5 border rounded-lg px-2.5 py-1 ${darkMode ? 'bg-blue-900/30 border-blue-700' : 'bg-blue-50 border-blue-200'}`}>
                            <PhoneIcon className="w-3.5 h-3.5 text-blue-600" />
                            <span className={`text-xs font-black dir-ltr ${darkMode ? 'text-blue-400' : 'text-blue-700'}`} dir="ltr">{c.userPhone}</span>
                            <a href={`tel:${c.userPhone}`} className="text-[9px] text-blue-500 hover:text-blue-700 underline" target="_blank" rel="noopener noreferrer">اتصال</a>
                          </div>
                        ) : (
                          <div className={`mt-1.5 inline-flex items-center gap-1 border rounded-lg px-2.5 py-1 ${darkMode ? 'bg-red-900/30 border-red-700' : 'bg-red-50 border-red-200'}`}>
                            <span className={`text-[10px] font-bold ${darkMode ? 'text-red-400' : 'text-red-600'}`}>⚠️ لا يوجد رقم هاتف</span>
                          </div>
                        )}
                        {/* Additional phone number for transfer matching */}
                        {c.additionalPhone && c.additionalPhone.trim() !== '' && (
                          <div className={`mt-1 inline-flex items-center gap-1.5 border rounded-lg px-2.5 py-1 ${darkMode ? 'bg-orange-900/30 border-orange-700' : 'bg-orange-50 border-orange-200'}`}>
                            <PhoneIcon className="w-3.5 h-3.5 text-orange-600" />
                            <span className={`text-[10px] font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>رقم آخر:</span>
                            <span className={`text-xs font-black dir-ltr ${darkMode ? 'text-orange-400' : 'text-orange-700'}`} dir="ltr">{c.additionalPhone}</span>
                            <a href={`tel:${c.additionalPhone}`} className="text-[9px] text-orange-500 hover:text-orange-700 underline" target="_blank" rel="noopener noreferrer">اتصال</a>
                          </div>
                        )}
                        <p className={`text-[10px] mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{c.createdAt ? formatTimeAgo(c.createdAt) : ''}</p>
                        {/* Receipt Image Display */}
                        {c.receiptImage && (
                          <div className="mt-2">
                            <a href={c.receiptImage} target="_blank" rel="noopener noreferrer" className="inline-block">
                              <img
                                src={c.receiptImage}
                                alt="إيصال التحويل"
                                className={`max-w-[180px] max-h-[120px] rounded-xl border object-cover cursor-pointer hover:shadow-md hover:border-orange-300 transition-all ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            </a>
                            <p className={`text-[9px] font-bold mt-1 flex items-center gap-1 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                              <ImageIcon className="w-3 h-3" />
                              إيصال التحويل - اضغط للتكبير
                            </p>
                          </div>
                        )}
                        {!c.receiptImage && c.status === 'pending' && (
                          <p className="text-[9px] text-red-500 font-bold mt-1">⚠️ لم يتم إرفاق إيصال</p>
                        )}
                      </div>
                      {c.status === 'pending' && (
                        <div className="flex gap-2 shrink-0">
                          <Btn darkMode={darkMode} variant="primary" size="sm" onClick={() => approveCharging(c.id)}><Check className="w-3.5 h-3.5" />قبول</Btn>
                          <Btn darkMode={darkMode} variant="danger" size="sm" onClick={() => rejectCharging(c.id)}><XCircle className="w-3.5 h-3.5" />رفض</Btn>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {filteredCharging.length === 0 && <EmptyState darkMode={darkMode} icon={<CreditCard className="w-12 h-12" />} text="لا توجد طلبات شحن" />}
              </div>
            </div>
          )}

          {/* ═══════ TAB 6: PROMOTIONS ═══════ */}
          {activeTab === 'promotions' && (
            <div className="space-y-4">
              <div className="flex gap-3 items-center">
                <select value={promoFilter} onChange={e => setPromoFilter(e.target.value as any)} className={`px-3 py-2 rounded-xl border text-xs font-bold ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'border-gray-200'}`}>
                  <option value="all">الكل ({promotionRequests.length})</option><option value="pending">معلقة ({promotionRequests.filter(p => p.status === 'pending').length})</option><option value="approved">مقبولة</option><option value="rejected">مرفوضة</option>
                </select>
              </div>
              <div className="grid gap-3 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
                {filteredPromos.map(p => (
                  <div key={p.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-4`}>
                    <div className="flex items-start gap-3">
                      <img src={p.postAuthor?.avatar || ''} alt="" className="w-10 h-10 rounded-xl shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap"><span className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{p.postAuthor?.name}</span><Badge darkMode={darkMode} color={p.status === 'pending' ? 'orange' : p.status === 'approved' ? 'green' : 'red'}>{p.status === 'pending' ? 'معلق' : p.status === 'approved' ? 'مقبول' : 'مرفوض'}</Badge></div>
                        <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{p.packageName || p.tier} • {p.price} ج.م</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {p.targetCity && (() => { try { const cities = JSON.parse(p.targetCity); return (Array.isArray(cities) ? cities : [p.targetCity]).map((c: string, i: number) => <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded ${darkMode ? 'bg-teal-900/40 text-teal-400' : 'bg-teal-50 text-teal-700'}`}>{c}</span>); } catch { return <span className={`text-[9px] px-1.5 py-0.5 rounded ${darkMode ? 'bg-teal-900/40 text-teal-400' : 'bg-teal-50 text-teal-700'}`}>{p.targetCity}</span>; } })()}
                          {p.targetAgeMin != null && p.targetAgeMax != null && p.targetAgeMin > 0 && p.targetAgeMax > 0 && <span className={`text-[9px] px-1.5 py-0.5 rounded ${darkMode ? 'bg-purple-900/40 text-purple-400' : 'bg-purple-50 text-purple-700'}`}>عمر {p.targetAgeMin}-{p.targetAgeMax}</span>}
                        </div>
                        {/* Prominent post content for admin review */}
                        {p.postContent && (
                          <div className={`mt-2 rounded-xl p-3 border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                            <p className={`text-xs leading-relaxed whitespace-pre-wrap ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{p.postContent}</p>
                          </div>
                        )}
                        {/* Post image preview */}
                        {(p as any).postImage && (
                          <div className="mt-2">
                            <img
                              src={(p as any).postImage}
                              alt="صورة المنشور"
                              className={`max-w-[200px] max-h-[150px] rounded-xl border object-cover ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                        )}
                        {/* Post price and location */}
                        {(p as any).postPrice > 0 && (
                          <div className={`mt-1 inline-flex items-center gap-1 text-xs font-bold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                            <DollarSign className="w-3 h-3" />{(p as any).postPrice} ج.م
                          </div>
                        )}
                        {(p as any).postLocation && (
                          <div className={`mt-0.5 inline-flex items-center gap-1 text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            <Globe className="w-3 h-3" />{(p as any).postLocation}
                          </div>
                        )}
                        {p.status === 'pending' && (
                          <button
                            onClick={() => navigate(`/post/${p.postId}`)}
                            className={`text-[10px] font-bold flex items-center gap-1 mt-1 ${darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'}`}
                            title="عرض المنشور"
                          >
                            <ExternalLink className="w-3 h-3" />عرض المنشور
                          </button>
                        )}
                      </div>
                      {p.status === 'pending' && (
                        <div className="flex gap-2 shrink-0">
                          <Btn darkMode={darkMode} variant="primary" size="sm" onClick={() => approvePromotion(p.id)}><Check className="w-3.5 h-3.5" />قبول</Btn>
                          <Btn darkMode={darkMode} variant="danger" size="sm" onClick={() => rejectPromotion(p.id)}><XCircle className="w-3.5 h-3.5" />رفض</Btn>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {filteredPromos.length === 0 && <EmptyState darkMode={darkMode} icon={<Zap className="w-12 h-12" />} text="لا توجد طلبات ترويج" />}
              </div>
            </div>
          )}

          {/* ═══════ TAB: MARKET PROMOTIONS ═══════ */}
          {activeTab === 'market-promotions' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 items-center">
                <select value={marketPromoFilter} onChange={e => setMarketPromoFilter(e.target.value as any)} className={`px-3 py-2 rounded-xl border text-xs font-bold ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'border-gray-200'}`}>
                  <option value="all">الكل ({marketPromoRequests.length})</option>
                  <option value="pending">معلقة ({marketPromoRequests.filter(p => p.status === 'pending').length})</option>
                  <option value="approved">مقبولة</option>
                  <option value="rejected">مرفوضة</option>
                </select>
                <div className="flex gap-2 mr-auto">
                  <Badge darkMode={darkMode} color="orange">معلقة: {marketPromoRequests.filter(p => p.status === 'pending').length}</Badge>
                  <Badge darkMode={darkMode} color="blue">إجمالي: {marketPromoRequests.length}</Badge>
                </div>
              </div>
              <div className="grid gap-3 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
                {filteredMarketPromos.map(p => (
                  <div key={p.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-4`}>
                    <div className="flex items-center gap-3">
                      <img src={p.sellerAvatar} alt="" className="w-10 h-10 rounded-xl shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{p.sellerName}</span>
                          <Badge darkMode={darkMode} color={p.status === 'pending' ? 'orange' : p.status === 'approved' ? 'green' : 'red'}>
                            {p.status === 'pending' ? 'معلق' : p.status === 'approved' ? 'مقبول' : 'مرفوض'}
                          </Badge>
                        </div>
                        <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{p.packageName || p.tier} • {p.price} ج.م</p>
                        <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>إعلان: {p.listingTitle}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {p.targetCity && (() => { try { const cities = JSON.parse(p.targetCity); return (Array.isArray(cities) ? cities : [p.targetCity]).map((c: string, i: number) => <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded ${darkMode ? 'bg-teal-900/40 text-teal-400' : 'bg-teal-50 text-teal-700'}`}>{c}</span>); } catch { return <span className={`text-[9px] px-1.5 py-0.5 rounded ${darkMode ? 'bg-teal-900/40 text-teal-400' : 'bg-teal-50 text-teal-700'}`}>{p.targetCity}</span>; } })()}
                          {p.targetAgeMin > 0 && p.targetAgeMax > 0 && <span className={`text-[9px] px-1.5 py-0.5 rounded ${darkMode ? 'bg-purple-900/40 text-purple-400' : 'bg-purple-50 text-purple-700'}`}>عمر {p.targetAgeMin}-{p.targetAgeMax}</span>}
                        </div>
                        <p className={`text-[10px] mt-0.5 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{p.createdAt ? new Date(p.createdAt).toLocaleDateString('ar-EG') : ''}</p>
                      </div>
                      {p.status === 'pending' && (
                        <div className="flex gap-2 shrink-0">
                          <Btn darkMode={darkMode} variant="primary" size="sm" onClick={() => approveMarketPromo(p.id)}><Check className="w-3.5 h-3.5" />قبول</Btn>
                          <Btn darkMode={darkMode} variant="danger" size="sm" onClick={() => rejectMarketPromo(p.id)}><XCircle className="w-3.5 h-3.5" />رفض</Btn>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {filteredMarketPromos.length === 0 && <EmptyState darkMode={darkMode} icon={<ShoppingBag className="w-12 h-12" />} text="لا توجد طلبات ترويج السوق" />}
              </div>
            </div>
          )}

          {/* ═══════ TAB: MARKET LISTINGS (Smart Market management) ═══════ */}
          {activeTab === 'market-listings' && (
            <MarketListingsTab />
          )}

          {/* ═══════ TAB 7: NEWS ═══════ */}
          {activeTab === 'news' && (
            <div className="space-y-4">
              <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-5 space-y-3`}>
                <h3 className={`text-sm font-black flex items-center gap-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}><Plus className="w-4 h-4 text-orange-500" />إضافة خبر/تنبيه</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input value={newsForm.title} onChange={e => setNewsForm(f => ({ ...f, title: e.target.value }))} placeholder="العنوان" className={`px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
                  <div className="flex gap-2">
                    <select value={newsForm.category} onChange={e => setNewsForm(f => ({ ...f, category: e.target.value as any }))} className={`px-3 py-2 rounded-xl border text-xs font-bold ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'border-gray-200'}`}>
                      <option value="general">عام</option><option value="egypt">مصر</option><option value="world">عالمي</option><option value="urgent">عاجل</option>
                    </select>
                    <label className={`flex items-center gap-1.5 text-xs font-bold cursor-pointer ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}><input type="checkbox" checked={newsForm.isAlert} onChange={e => setNewsForm(f => ({ ...f, isAlert: e.target.checked }))} className="rounded" />تنبيه</label>
                  </div>
                </div>
                <textarea value={newsForm.content} onChange={e => setNewsForm(f => ({ ...f, content: e.target.value }))} placeholder="المحتوى..." rows={3} className={`w-full px-3 py-2 rounded-xl border text-sm resize-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
                <div className="flex gap-2 justify-end">
                  <Btn darkMode={darkMode} variant="primary" onClick={handleAddNews}><Plus className="w-3.5 h-3.5" />إضافة</Btn>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                {['all', 'egypt', 'world', 'urgent', 'general'].map(f => (
                  <button key={f} onClick={() => setNewsFilter(f as any)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${newsFilter === f ? 'bg-orange-500 text-white' : darkMode ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {f === 'all' ? 'الكل' : f === 'egypt' ? 'مصر' : f === 'world' ? 'عالمي' : f === 'urgent' ? 'عاجل' : 'عام'}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 max-h-[calc(100vh-400px)] overflow-y-auto custom-scrollbar">
                {filteredNews.map((n: any) => (
                  <div key={n.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-4`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${n.is_alert ? (darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-500') : (darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-500')}`}>
                        {n.is_alert ? <AlertTriangle className="w-4 h-4" /> : <Newspaper className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap"><span className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{n.title}</span>{n.is_alert && <Badge darkMode={darkMode} color="red">تنبيه</Badge>}<Badge darkMode={darkMode} color={n.category === 'egypt' ? 'orange' : n.category === 'world' ? 'blue' : n.category === 'urgent' ? 'red' : 'gray'}>{n.category === 'egypt' ? 'مصر' : n.category === 'world' ? 'عالمي' : n.category === 'urgent' ? 'عاجل' : 'عام'}</Badge></div>
                        <p className={`text-xs mt-1 line-clamp-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{n.content}</p>
                        <p className={`text-[10px] mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{n.source} • {n.created_at ? formatTimeAgo(n.created_at) : ''}</p>
                      </div>
                      <Btn darkMode={darkMode} size="xs" variant="danger" onClick={() => handleDeleteNews(n.id)}><Trash2 className="w-3 h-3" /></Btn>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══════ TAB 8: PUBLISH ═══════ */}
          {activeTab === 'publish' && (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-6 space-y-4`}>
                <h3 className={`text-sm font-black flex items-center gap-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}><Plus className="w-4 h-4 text-orange-500" />نشر منشور كمسؤول</h3>
                <div className="flex gap-2">
                  {[{ type: 'ad' as const, label: 'إعلان', icon: <Package className="w-4 h-4" /> }, { type: 'news' as const, label: 'خبر', icon: <Newspaper className="w-4 h-4" /> }, { type: 'status' as const, label: 'حالة', icon: <MessageCircle className="w-4 h-4" /> }].map(t => (
                    <button key={t.type} onClick={() => setAdminPostType(t.type)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${adminPostType === t.type ? 'bg-orange-500 text-white' : darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>{t.icon}{t.label}</button>
                  ))}
                </div>
                <textarea value={adminPostContent} onChange={e => setAdminPostContent(e.target.value)} placeholder="محتوى المنشور..." rows={5} className={`w-full px-4 py-3 rounded-xl border text-sm resize-none focus:outline-none focus:border-orange-300 ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
                <input value={adminPostImage} onChange={e => setAdminPostImage(e.target.value)} placeholder="رابط الصورة (اختياري)" className={`w-full px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
                {adminPostType === 'ad' && (
                  <div className="grid grid-cols-2 gap-3">
                    <input value={adminPostPrice} onChange={e => setAdminPostPrice(e.target.value)} type="number" placeholder="السعر" className={`px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
                    <input value={adminPostLocation} onChange={e => setAdminPostLocation(e.target.value)} placeholder="الموقع" className={`px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
                  </div>
                )}
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={adminPostPromoted} onChange={e => setAdminPostPromoted(e.target.checked)} className="rounded" /><span className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>ترويج المنشور تلقائياً</span></label>
                <div className="flex justify-end"><Btn darkMode={darkMode} variant="primary" size="md" onClick={handlePublishPost}><Send className="w-4 h-4" />نشر الآن</Btn></div>
              </div>
            </div>
          )}

          {/* ═══════ TAB 9: REPORTS ═══════ */}
          {activeTab === 'reports' && (
            <div className="space-y-4">
              <div className="flex gap-3 items-center"><Badge darkMode={darkMode} color="red">بلاغات: {reports.length}</Badge></div>
              <div className="grid gap-3 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
                {reports.map(r => (
                  <div key={r.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-4`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-red-500 shrink-0"><AlertTriangle className="w-5 h-5" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap"><span className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{r.userName || 'مجهول'}</span><Badge darkMode={darkMode} color="red">{r.reason || 'محتوى مخالف'}</Badge><Badge darkMode={darkMode} color={r.status === 'flagged' ? 'orange' : 'gray'}>{r.status}</Badge></div>
                        <p className={`text-xs mt-1 line-clamp-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{r.postContent}</p>
                        <p className={`text-[10px] mt-1 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{r.createdAt ? formatTimeAgo(r.createdAt) : ''}</p>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => reportAction(r.id, 'dismiss')}><Check className="w-3 h-3" />رفض</Btn>
                        <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => reportAction(r.id, 'warn_user')}><AlertTriangle className="w-3 h-3" />تحذير</Btn>
                        <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => reportAction(r.id, 'delete_post')}><Trash2 className="w-3 h-3" />حذف</Btn>
                        <Btn darkMode={darkMode} size="xs" variant="danger" onClick={() => reportAction(r.id, 'ban_user')}><Ban className="w-3 h-3" />حظر</Btn>
                      </div>
                    </div>
                  </div>
                ))}
                {reports.length === 0 && <EmptyState darkMode={darkMode} icon={<Flag className="w-12 h-12" />} text="لا توجد بلاغات" />}
              </div>
            </div>
          )}

          {/* ═══════ TAB 10: CATEGORIES ═══════ */}
          {activeTab === 'categories' && (
            <div className="space-y-4">
              <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-5`}>
                <div className="flex gap-3 items-end">
                  <div className="flex-1"><label className="text-[10px] text-gray-400 mb-1 block">اسم الفئة</label><input value={catName} onChange={e => setCatName(e.target.value)} placeholder="اسم الفئة" className={`w-full px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} /></div>
                  <div className="w-24"><label className="text-[10px] text-gray-400 mb-1 block">الأيقونة</label><input value={catIcon} onChange={e => setCatIcon(e.target.value)} placeholder="📁" className={`w-full px-3 py-2 rounded-xl border text-sm text-center ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} /></div>
                  <Btn darkMode={darkMode} variant="primary" onClick={editingCatId ? () => updateCategoryHandler(editingCatId) : addCategoryHandler}>{editingCatId ? 'تحديث' : 'إضافة'}</Btn>
                  {editingCatId && <Btn darkMode={darkMode} variant="outline" onClick={() => { setEditingCatId(null); setCatName(''); setCatIcon(''); }}>إلغاء</Btn>}
                </div>
              </div>
              <div className="grid gap-2 max-h-[calc(100vh-300px)] overflow-y-auto custom-scrollbar">
                {allCategories.sort((a: any, b: any) => (a.sort || 0) - (b.sort || 0)).map((c: any) => (
                  <div key={c.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-xl border p-3 flex items-center gap-3`}>
                    <span className="text-xl">{c.icon || '📁'}</span>
                    <span className={`font-bold text-sm flex-1 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{c.name}</span>
                    <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => { setEditingCatId(c.id); setCatName(c.name); setCatIcon(c.icon || ''); }}><Edit3 className="w-3 h-3" /></Btn>
                    <Btn darkMode={darkMode} size="xs" variant="danger" onClick={() => deleteCategoryHandler(c.id)}><Trash2 className="w-3 h-3" /></Btn>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══════ TAB 11: TRANSACTIONS ═══════ */}
          {activeTab === 'transactions' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 items-center">
                <select value={txFilter} onChange={e => { setTxFilter(e.target.value); setTxPage(1); }} className={`px-3 py-2 rounded-xl border text-xs font-bold ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'border-gray-200'}`}>
                  <option value="all">كل الأنواع</option><option value="deposit">إيداع</option><option value="charge_request">طلب شحن</option><option value="promotion_debit">خصم ترويج</option><option value="promotion_refund">استرداد</option><option value="admin_deposit">إيداع مدير</option><option value="admin_withdrawal">سحب مدير</option>
                </select>
                <Badge darkMode={darkMode} color="blue">الإجمالي: {txTotal}</Badge>
              </div>
              <div className="grid gap-2 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
                {transactions.map(tx => (
                  <div key={tx.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-xl border p-3 flex items-center gap-3`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tx.amount > 0 ? 'bg-green-50 text-green-500' : 'bg-red-50 text-red-500'}`}>
                      {tx.amount > 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><span className={`font-bold text-xs ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{tx.user_name || 'مجهول'}</span><Badge darkMode={darkMode} color="gray">{TRANSACTION_TYPE_LABELS[tx.type] || tx.type}</Badge><Badge darkMode={darkMode} color={tx.status === 'completed' ? 'green' : 'orange'}>{tx.status}</Badge></div>
                      <p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{tx.method} • {tx.created_at ? formatTimeAgo(tx.created_at) : ''}</p>
                    </div>
                    <span className={`font-black text-sm ${tx.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>{tx.amount > 0 ? '+' : ''}{tx.amount} ج.م</span>
                  </div>
                ))}
                {transactions.length === 0 && <EmptyState darkMode={darkMode} icon={<Wallet className="w-12 h-12" />} text="لا توجد معاملات" />}
              </div>
              {txTotal > 50 && <div className="flex justify-center gap-2"><Btn darkMode={darkMode} variant="outline" disabled={txPage <= 1} onClick={() => setTxPage(p => p - 1)}>السابق</Btn><span className="text-xs text-gray-400 py-2">صفحة {txPage}</span><Btn darkMode={darkMode} variant="outline" onClick={() => setTxPage(p => p + 1)}>التالي</Btn></div>}
            </div>
          )}

          {/* ═══════ TAB 12: STORIES ═══════ */}
          {activeTab === 'stories' && (
            <div className="space-y-4">
              <Badge darkMode={darkMode} color="orange">القصص: {adminStories.length}</Badge>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
                {adminStories.map(s => (
                  <div key={s.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border overflow-hidden group`}>
                    <div className={`aspect-[9/16] ${darkMode ? 'bg-gray-700' : 'bg-gray-100'} relative`}>
                      {s.image ? <img src={s.image} alt="" className="w-full h-full object-cover" /> : <div className={`w-full h-full flex items-center justify-center ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}><ImageIcon className="w-8 h-8" /></div>}
                      <button onClick={() => handleDeleteStory(s.id)} className="absolute top-2 left-2 w-7 h-7 bg-red-500/80 text-white rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="p-2"><p className={`text-[10px] font-bold truncate ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{s.user_name}</p><p className={`text-[9px] ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{s.created_at ? formatTimeAgo(s.created_at) : ''}</p></div>
                  </div>
                ))}
                {adminStories.length === 0 && <EmptyState darkMode={darkMode} icon={<ImageIcon className="w-12 h-12" />} text="لا توجد قصص" />}
              </div>
            </div>
          )}

          {/* ═══════ TAB 13: MESSAGES ═══════ */}
          {activeTab === 'messages' && (
            <div className="space-y-4">
              <div className="relative max-w-md"><Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-300" /><input value={msgSearch} onChange={e => setMsgSearch(e.target.value)} placeholder="بحث في الرسائل..." className={`w-full pr-10 pl-4 py-2 rounded-xl border text-sm focus:outline-none focus:border-orange-300 ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-200'}`} /></div>
              <div className="grid gap-2 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
                {filteredMessages.map(m => (
                  <div key={m.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-xl border p-3 flex items-center gap-3`}>
                    <div className="w-8 h-8 bg-blue-50 text-blue-500 rounded-lg flex items-center justify-center shrink-0"><MessageSquare className="w-4 h-4" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><span className={`font-bold text-[11px] ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{m.sender_name}</span><span className={`text-[10px] ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>←</span><span className={`font-bold text-[11px] ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{m.receiver_name}</span></div>
                      <p className={`text-xs truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{m.text}</p>
                      <p className={`text-[9px] ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{m.created_at ? formatTimeAgo(m.created_at) : ''}</p>
                    </div>
                    <Btn darkMode={darkMode} size="xs" variant="danger" onClick={() => handleDeleteMessage(m.id)}><Trash2 className="w-3 h-3" /></Btn>
                  </div>
                ))}
                {filteredMessages.length === 0 && <EmptyState darkMode={darkMode} icon={<MessageSquare className="w-12 h-12" />} text="لا توجد رسائل" />}
              </div>
            </div>
          )}

          {/* ═══════ TAB 14: SMART LINKS ═══════ */}
          {activeTab === 'smartlinks' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard darkMode={darkMode} icon={<Link2 className="w-5 h-5" />} label="إجمالي الروابط" value={smartLinksData?.totalLinks || 0} color="#f27d26" />
                <StatCard darkMode={darkMode} icon={<MousePointer className="w-5 h-5" />} label="إجمالي الزيارات" value={smartLinksData?.totalVisits || 0} color="#10b981" />
                <StatCard darkMode={darkMode} icon={<Users className="w-5 h-5" />} label="زوار فريدون" value={smartLinksData?.uniqueVisitors || 0} color="#3b82f6" />
              </div>

              {smartLinksData?.visitsByDate?.length > 0 && (
                <Section darkMode={darkMode} title="الزيارات اليومية" icon={<TrendingUp className="w-5 h-5" />}>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={smartLinksData.visitsByDate}>
                      <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#374151' : '#f3f4f6'} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: darkMode ? '1px solid #374151' : '1px solid #f3f4f6', fontSize: 12, background: darkMode ? '#1f2937' : '#fff', color: darkMode ? '#fff' : '#000' }} />
                      <Line type="monotone" dataKey="count" stroke={ORANGE} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Section>
              )}

              <Section darkMode={darkMode} title="أفضل الروابط" icon={<Star className="w-5 h-5" />}>
                {smartLinksData?.topLinks?.length > 0 ? (
                  <div className="space-y-2">
                    {smartLinksData.topLinks.map((link: any, i: number) => (
                      <div key={i} className={`flex items-center gap-3 p-2 rounded-xl ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}>
                        <span className="w-6 h-6 bg-orange-50 text-orange-500 rounded-lg flex items-center justify-center text-xs font-black">{i + 1}</span>
                        <div className="flex-1 min-w-0"><p className={`text-xs truncate ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{link.content?.slice(0, 50) || 'منشور'}</p><p className={`text-[10px] ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{link.smart_link_alias}</p></div>
                        <div className="text-left"><p className={`text-xs font-bold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{link.visit_count} زيارة</p><p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{link.unique_visitors} فريد</p></div>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState darkMode={darkMode} icon={<Link2 className="w-12 h-12" />} text="لا توجد روابط ذكية بعد" />}
              </Section>
            </div>
          )}

          {/* ═══════ TAB 15: ACTIVITY LOG ═══════ */}
          {activeTab === 'activity' && (
            <div className="space-y-4">
              <div className="max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar space-y-2">
                {activityLog.map((item, i) => {
                  const colors: Record<string, string> = { user: 'green', post: 'blue', transaction: 'purple', promotion: 'orange', report: 'red' };
                  const icons: Record<string, React.ReactNode> = { user: <Users className="w-3.5 h-3.5" />, post: <Package className="w-3.5 h-3.5" />, transaction: <DollarSign className="w-3.5 h-3.5" />, promotion: <Zap className="w-3.5 h-3.5" />, report: <Flag className="w-3.5 h-3.5" /> };
                  const bgColors: Record<string, string> = { user: 'bg-green-50 text-green-500', post: 'bg-blue-50 text-blue-500', transaction: 'bg-purple-50 text-purple-500', promotion: 'bg-orange-50 text-orange-500', report: 'bg-red-50 text-red-500' };
                  const t = item.activity_type || item.type || 'post';
                  return (
                    <div key={item.id || i} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-xl border p-3 flex items-center gap-3`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${bgColors[t] || (darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-50 text-gray-500')}`}>{icons[t] || <Activity className="w-3.5 h-3.5" />}</div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}><span className="font-bold">{item.user_name || 'مجهول'}</span> {item.content || item.package_name || item.tx_type || ''} {item.amount ? `• ${item.amount} ج.م` : ''}</p>
                        <p className={`text-[10px] ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>{item.created_at ? formatTimeAgo(item.created_at) : ''}</p>
                      </div>
                      <Badge darkMode={darkMode} color={colors[t] || 'gray'}>{t}</Badge>
                    </div>
                  );
                })}
                {activityLog.length === 0 && <EmptyState darkMode={darkMode} icon={<Activity className="w-12 h-12" />} text="لا يوجد نشاط مسجل" />}
              </div>
            </div>
          )}

          {/* ═══════ TAB 16: BROADCAST ═══════ */}
          {activeTab === 'broadcast' && (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-6 space-y-4`}>
                <h3 className={`text-sm font-black flex items-center gap-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}><Radio className="w-4 h-4 text-orange-500" />إرسال إشعار جماعي</h3>
                <div className="flex gap-2">
                  {(['system', 'alert', 'promotion'] as const).map(type => (
                    <button key={type} onClick={() => setBroadcastType(type)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${broadcastType === type ? 'bg-orange-500 text-white' : darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                      {type === 'system' ? 'نظام' : type === 'alert' ? 'تنبيه' : 'ترويج'}
                    </button>
                  ))}
                </div>
                <input value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value)} placeholder="عنوان الإشعار" className={`w-full px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
                <textarea value={broadcastMessage} onChange={e => setBroadcastMessage(e.target.value)} placeholder="نص الرسالة..." rows={4} className={`w-full px-3 py-2 rounded-xl border text-sm resize-none ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
                <div className="flex justify-end"><Btn darkMode={darkMode} variant="primary" size="md" onClick={handleBroadcast} disabled={broadcastSending}>{broadcastSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{broadcastSending ? 'جارٍ الإرسال...' : 'إرسال للجميع'}</Btn></div>
              </div>
            </div>
          )}

          {/* ═══════ TAB 17: DATABASE ═══════ */}
          {activeTab === 'database' && (
            <div className="space-y-6">
              {dbInfo && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatCard darkMode={darkMode} icon={<Database className="w-5 h-5" />} label="حجم القاعدة" value={dbInfo.dbSizeFormatted} color="#8b5cf6" />
                  <StatCard darkMode={darkMode} icon={<Layers className="w-5 h-5" />} label="عدد الجداول" value={dbInfo.totalTables} color="#06b6d4" />
                  <StatCard darkMode={darkMode} icon={<HardDrive className="w-5 h-5" />} label="الحجم بالبايت" value={dbInfo.dbSize.toLocaleString()} color="#10b981" />
                </div>
              )}

              {dbInfo?.tables && (
                <Section darkMode={darkMode} title="حجم الجداول" icon={<Database className="w-5 h-5" />}>
                  <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                    {Object.entries(dbInfo.tables).sort(([, a], [, b]) => (b as number) - (a as number)).map(([table, count]) => (
                      <div key={table} className="flex items-center gap-3">
                        <span className={`text-xs font-bold w-32 shrink-0 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{table}</span>
                        <div className={`flex-1 rounded-full h-2.5 overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                          <div className="h-full rounded-full bg-orange-400" style={{ width: `${Math.min(100, ((count as number) / Math.max(...Object.values(dbInfo.tables))) * 100)}%` }} />
                        </div>
                        <span className={`text-xs font-bold w-16 text-left ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{count as number}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              <Section darkMode={darkMode} title="عمليات التنظيف" icon={<Wrench className="w-5 h-5" />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { action: 'sessions', label: 'تنظيف الجلسات المنتهية', icon: <Clock className="w-4 h-4" />, desc: 'حذف الجلسات منتهية الصلاحية' },
                    { action: 'expired_promotions', label: 'تنظيف الترويجات المنتهية', icon: <Zap className="w-4 h-4" />, desc: 'إلغاء الترويجات منتهية الصلاحية' },
                    { action: 'old_stories', label: 'تنظيف القصص القديمة', icon: <ImageIcon className="w-4 h-4" />, desc: 'حذف القصص الأقدم من 24 ساعة' },
                    { action: 'orphan_data', label: 'تنظيف البيانات اليتيمة', icon: <Trash2 className="w-4 h-4" />, desc: 'حذف البيانات بلا مالك' },
                    { action: 'optimize', label: 'تحسين القاعدة', icon: <Wrench className="w-4 h-4" />, desc: 'ضغط وتحسين أداء القاعدة' },
                  ].map(item => (
                    <div key={item.action} className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-xl p-4 space-y-2`}>
                      <div className="flex items-center gap-2"><span className="text-orange-500">{item.icon}</span><span className={`text-xs font-bold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{item.label}</span></div>
                      <p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{item.desc}</p>
                      <Btn darkMode={darkMode} variant="outline" size="sm" disabled={cleanupRunning} onClick={() => { if (confirm(`هل أنت متأكد من ${item.label}؟`)) handleCleanup(item.action); }}>{cleanupRunning ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />}تنفيذ</Btn>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}

          {/* ═══════ TAB 18: SETTINGS ═══════ */}
          {activeTab === 'settings' && (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-6 space-y-5`}>
                <h3 className={`text-sm font-black flex items-center gap-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}><Cog className="w-4 h-4 text-orange-500" />إعدادات الموقع</h3>
                <div className="space-y-4">
                  <div><label className={`text-xs font-bold mb-1 block ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>اسم الموقع</label><input value={siteSettings.siteName} onChange={e => setSiteSettings(s => ({ ...s, siteName: e.target.value }))} className={`w-full px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} /></div>
                  <div className="flex items-center justify-between"><div><label className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>وضع الصيانة</label><p className="text-[10px] text-gray-400">تعطيل الموقع مؤقتاً للصيانة</p></div><button onClick={() => setSiteSettings(s => ({ ...s, maintenanceMode: !s.maintenanceMode }))} className={`w-12 h-7 rounded-full transition-all ${siteSettings.maintenanceMode ? 'bg-orange-500' : 'bg-gray-200'}`}><div className={`w-5 h-5 bg-white rounded-full shadow transition-all ${siteSettings.maintenanceMode ? 'translate-x-5.5' : 'translate-x-1'}`} /></button></div>
                  <div><label className={`text-xs font-bold mb-1 block ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>حجم الرفع الأقصى (ميجا)</label><input type="number" value={siteSettings.maxUploadSize} onChange={e => setSiteSettings(s => ({ ...s, maxUploadSize: parseInt(e.target.value) || 5 }))} className={`w-full px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} /></div>
                  <div><label className={`text-xs font-bold mb-1 block ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>رصيد المحفظة الافتراضي</label><input type="number" value={siteSettings.defaultWalletBalance} onChange={e => setSiteSettings(s => ({ ...s, defaultWalletBalance: parseFloat(e.target.value) || 0 }))} className={`w-full px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} /></div>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <Btn darkMode={darkMode} variant="outline" onClick={loadSettings}>استعادة</Btn>
                  <Btn darkMode={darkMode} variant="primary" onClick={saveSettings}><Save className="w-4 h-4" />حفظ الإعدادات</Btn>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};
