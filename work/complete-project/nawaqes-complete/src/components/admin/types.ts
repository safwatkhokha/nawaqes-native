// ─── Admin Tab Type ──────────────────────────────────────────────────
export type AdminTab =
  | 'overview' | 'users' | 'posts' | 'support' | 'comments'
  | 'charging' | 'promotions' | 'market-promotions' | 'market-live' | 'channels'
  | 'news' | 'publish' | 'reports' | 'categories' | 'transactions'
  | 'withdrawals' | 'stories' | 'messages' | 'smartlinks'
  | 'activity' | 'broadcast' | 'database' | 'settings';

// ─── Interfaces ──────────────────────────────────────────────────────
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  phone: string;
  location: string;
  walletBalance: number;
  trustScore: number;
  isVerified: boolean;
  isAdmin: boolean;
  isTrusted: boolean;
  isDeactivated: boolean;
  joinDate: string;
  gender: string;
  showPhone: boolean;
  dateOfBirth?: string;
  interests?: string[];
}

export interface ReportItem {
  id: string;
  postId?: string;
  userId?: string;
  reporterId: string;
  reporterName: string;
  reason: string;
  postContent?: string;
  userName?: string;
  status: string;
  createdAt: string;
}

export interface SiteSettings {
  siteName: string;
  maintenanceMode: boolean;
  maxUploadSize: number;
  defaultWalletBalance: number;
}

export interface ActivityItem {
  id: string;
  activity_type: string;
  user_name?: string;
  content?: string;
  type?: string;
  tx_type?: string;
  status?: string;
  amount?: number;
  package_name?: string;
  created_at: string;
}

export interface TransactionItem {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  type: string;
  amount: number;
  method: string;
  status: string;
  created_at: string;
}

export interface ChatMessageItem {
  id: string;
  sender_id: string;
  receiver_id: string;
  text: string;
  sender_name?: string;
  receiver_name?: string;
  created_at: string;
}

export interface StoryItem {
  id: string;
  user_id: string;
  user_name?: string;
  user_avatar?: string;
  image?: string;
  type?: string;
  text?: string;
  created_at: string;
}

export interface DatabaseInfo {
  tables: Record<string, number>;
  totalTables: number;
  dbSize: number;
  dbSizeFormatted: string;
}

export interface CommentItem {
  id: string;
  post_id: string;
  author_id: string;
  author_name: string;
  author_avatar: string;
  content: string;
  created_at: string;
  post_content?: string;
  author_verified?: boolean;
}

export interface MarketPromoRequest {
  id: string;
  listingId: string;
  listingTitle: string;
  sellerId: string;
  sellerName: string;
  sellerAvatar: string;
  tier: string;
  packageName?: string;
  price: number;
  duration?: number;
  estimatedReach?: number;
  targeting?: string;
  targetCity?: string;
  targetInterests?: string[];
  targetAgeMin?: number;
  targetAgeMax?: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

// ─── Tab Config ──────────────────────────────────────────────────────
export interface TabConfig {
  id: AdminTab;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}
