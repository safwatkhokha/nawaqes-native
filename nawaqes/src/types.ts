export interface User {
  id: string;
  name: string;
  avatar: string;
  isVerified?: boolean;
  isAdmin?: boolean;
  isTrusted?: boolean;
  walletBalance?: number;
  trustScore?: number;
  isFriend?: boolean;
  isFollowing?: boolean;
  isBlocked?: boolean;
  gender?: 'male' | 'female';
  location?: string;
  phone?: string;
  email?: string;
  email_verified?: boolean;
  is_verified?: boolean;
  dateOfBirth?: string;
  age?: number;
  showPhone?: boolean;
  showLocation?: boolean;
  paymentMethods?: { id: string; name: string; icon: string; details: string }[];
  interests?: string[];
  bio?: string;
  coverPhoto?: string;
  isDeactivated?: boolean;
  joinDate?: string;
  avatarBase64?: string;
}

export interface Post {
  id: string;
  author: User;
  content: string;
  image?: string;
  likes: number;
  comments: number;
  shares: number;
  timestamp: string;
  type: "ad" | "news" | "status" | "food";
  price?: number;
  currency?: string;
  paymentMethods?: string[];
  isBoosted?: boolean;
  isPromoted?: boolean;
  promotionTier?: 'basic' | 'standard' | 'premium' | 'vip' | 'city_target' | 'interest_target';
  promotionStatus?: 'pending' | 'approved' | 'rejected';
  promotionExpiresAt?: string;
  promotionPackage?: string; // package id
  promotionStartedAt?: string; // ISO date when promotion started
  reachCount?: number;
  clickCount?: number;
  estimatedReach?: number;
  location?: string;
  status?: "active" | "flagged" | "deleted";
  feeling?: string;
  activity?: string;
  category?: string;
  targetAgeMin?: number;
  targetAgeMax?: number;
  targetCity?: string;
  targetInterests?: string[];
  targeting?: 'location' | 'interests' | 'all' | 'city';
}

export interface FriendRequest {
  id: string;
  user: User;
  timestamp: string;
}

export interface DashboardStats {
  totalUsers: number;
  activeAds: number;
  totalTransactions: number;
  dailyGrowth: number;
  revenue: number;
}

export interface Trend {
  id: string;
  item: string;
  trend: "up" | "down" | "stable";
  change: string;
  category?: string;
  price?: number;
  updated_at?: string;
}

export interface Notification {
  id: string;
  type: "match" | "payment" | "system" | "promotion" | "message" | "alert" | "friend" | "like" | "comment" | "share" | "market" | "warning" | "livestream" | "video_like" | "video_save" | "video_share";
  message: string;
  time: string;
  postId?: string;
  userId?: string;
  link?: string;
}

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  source: string;
  isAlert?: boolean;
  category?: 'general' | 'egypt' | 'world' | 'urgent';
  createdAt?: string;
}

export interface Story {
  id: string;
  user: User;
  image: string;
  isSeen?: boolean;
  createdAt?: string;
  type?: 'image' | 'text';
  text?: string;
  backgroundColor?: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
}

export interface ChartDataPoint {
  name: string;
  ads: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  timestamp: string;
  read: boolean;
  postId?: string;
  messageType?: 'text' | 'image' | 'post' | 'system' | 'voice';
  imageUrl?: string;
  replyToId?: string;
  reactions?: Record<string, string>;
  deletedFor?: string;
  _failed?: boolean;
  isEdited?: boolean;
  isPinned?: boolean;
  delivered?: boolean;
  voiceUrl?: string;
  voiceDuration?: number;
  // Phase 3
  groupId?: string;
  isForwarded?: boolean;
  forwardedFrom?: string;
  _queued?: boolean; // offline queue pending indicator
}

export interface ChatContact {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  lastTime: string;
  unread: number;
  online: boolean;
  postId?: string;
  // Phase 3
  isGroup?: boolean;
  groupId?: string;
  isMuted?: boolean;
  isBlocked?: boolean;
  memberCount?: number;
}

export interface PromotionRequest {
  id: string;
  postId: string;
  postContent: string;
  postAuthor: User;
  tier: 'basic' | 'standard' | 'premium' | 'vip' | 'city_target' | 'interest_target';
  price: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  packageName?: string;
  duration?: number;
  estimatedReach?: number;
  maxNotifications?: number;
  includeMessages?: boolean;
  targeting?: 'location' | 'interests' | 'all' | 'city';
  targetCity?: string;          // legacy single city (kept for backward compat)
  targetCities?: string[];       // NEW: multiple cities array
  targetInterests?: string[];
  targetAgeMin?: number;
  targetAgeMax?: number;
  cityCount?: number;
}

export interface ChargingRequest {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  userPhone?: string;
  additionalPhone?: string;
  amount: number;
  method: string;
  receiptImage?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

// Store types
export interface Store {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerAvatar: string;
  name: string;
  description: string;
  category: string;
  location?: string;
  phone?: string;
  whatsapp?: string;
  rating?: number;
  reviewCount?: number;
  coverImage?: string;
  logoImage?: string;
  isPromoted?: boolean;
  promotionTier?: 'basic' | 'standard' | 'premium';
  promotionStatus?: 'pending' | 'approved' | 'rejected';
  promotionExpiresAt?: string;
  createdAt: string;
}

export interface StorePromotionRequest {
  id: string;
  storeId: string;
  storeName: string;
  ownerName: string;
  ownerAvatar: string;
  tier: 'basic' | 'standard' | 'premium';
  price: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

// Market Listing types
export interface MarketListing {
  id: string;
  seller: User;
  title: string;
  description: string;
  images: string[];
  price?: number;
  currency?: string;
  category: string;
  subcategory?: string;
  condition: 'new' | 'used' | 'refurbished';
  location?: string;
  city?: string;
  phone?: string;
  whatsapp?: string;
  paymentMethods?: any[];
  isFeatured?: boolean;
  isPromoted?: boolean;
  promotionTier?: string;
  promotionStatus?: 'pending' | 'approved' | 'rejected' | 'expired';
  promotionPackage?: string;
  promotionStartedAt?: string;
  promotionExpiresAt?: string;
  viewsCount?: number;
  savesCount?: number;
  inquiriesCount?: number;
  sharesCount?: number;
  estimatedReach?: number;
  reachCount?: number;
  targeting?: string;
  targetCity?: string;
  targetInterests?: string[];
  targetAgeMin?: number;
  targetAgeMax?: number;
  status?: 'active' | 'paused' | 'sold' | 'deleted';
  createdAt?: string;
  updatedAt?: string;
}

export interface MarketPromotionPackage {
  id: string;
  name: string;
  nameEn: string;
  price: number;
  duration: number; // in days
  estimatedReach: number;
  maxNotifications: number;
  features: string[];
  icon: string;
  color: string;
  targeting: 'all' | 'city' | 'interests';
  includeMessages?: boolean;
  popular?: boolean;
}

export interface MarketStats {
  totalListings: number;
  totalSellers: number;
  averagePrice: number;
  newToday: number;
  categoryBreakdown: { category: string; count: number; avg_price: number }[];
}

// Promotion package definition
export interface PromotionPackage {
  id: 'basic' | 'standard' | 'premium' | 'vip' | 'city_target' | 'interest_target';
  name: string;
  price: number;
  duration: number; // days
  estimatedReach: number;
  features: string[];
  icon: string;
  color: string;
  maxNotifications: number;
  includeMessages?: boolean;
  showBadge?: string;
  targeting?: 'location' | 'interests' | 'all' | 'city';
  // City targeting metadata (only for city_target package)
  cityTargeting?: {
    minCities: number;
    maxCities: number;
    tiers: CityTargetingTier[];
  };
}

// City targeting pricing tier
export interface CityTargetingTier {
  minCities: number;
  maxCities: number;
  label: string;
  price: number;
  estimatedReach: number;
  maxNotifications: number;
}

// Phase 3: Group chat types
export interface ChatGroup {
  id: string;
  name: string;
  avatar: string;
  description: string;
  creatorId: string;
  createdAt: string;
  members: ChatGroupMember[];
  lastMessage?: string;
  lastTime?: string;
  unread?: number;
  isMuted?: boolean;
}

export interface ChatGroupMember {
  id: string;
  userId: string;
  name: string;
  avatar: string;
  role: 'admin' | 'member';
  joinedAt: string;
}

// Egyptian city data
export interface EgyptianCity {
  id: string;
  nameAr: string;
  nameEn: string;
  region: 'cairo' | 'delta' | 'alex' | 'canal' | 'upper' | 'coast' | 'oases' | 'sinai';
  isGovernorate?: boolean;
  population?: number;
}
