// ─── Market Promotion Packages Data ──────────────────────────────
// Available promotion packages for boosting marketplace listings
// Similar to promotionPackages but tailored for the marketplace context

export interface MarketPromotionPackage {
  id: string;
  name: string;
  nameAr: string;
  duration: number; // days
  price: number; // EGP
  features: string[];
  featuresAr: string[];
  tier: 'basic' | 'standard' | 'premium' | 'vip';
  color: string;
  icon: string;
  estimatedReach: number;
  maxNotifications: number;
  includeMessages: boolean;
  targeting: 'all' | 'city' | 'interests';
}

export const marketPromotionPackages: MarketPromotionPackage[] = [
  {
    id: 'basic',
    name: 'Basic',
    nameAr: 'أساسي',
    duration: 3,
    price: 75,
    estimatedReach: 800,
    features: [
      '3-day boost',
      'Basic listing analytics',
      'Category targeting',
      'Appears in search results',
    ],
    featuresAr: [
      'ترويج لمدة 3 أيام',
      'إحصائيات أساسية للإعلان',
      'استهداف الفئات',
      'يظهر في نتائج البحث',
    ],
    tier: 'basic',
    color: 'from-blue-500 to-blue-600',
    icon: '🛒',
    maxNotifications: 200,
    includeMessages: false,
    targeting: 'all',
  },
  {
    id: 'standard',
    name: 'Standard',
    nameAr: 'قياسي',
    duration: 7,
    price: 180,
    estimatedReach: 3000,
    features: [
      '7-day boost',
      'Detailed analytics',
      'Category & location targeting',
      'Priority in marketplace feed',
      'Highlighted listing badge',
    ],
    featuresAr: [
      'ترويج لمدة 7 أيام',
      'إحصائيات مفصلة',
      'استهداف الفئات والموقع',
      'أولوية في خلاصة السوق',
      'شارة إعلان مميز',
    ],
    tier: 'standard',
    color: 'from-purple-500 to-purple-600',
    icon: '⭐',
    maxNotifications: 600,
    includeMessages: false,
    targeting: 'city',
  },
  {
    id: 'premium',
    name: 'Premium',
    nameAr: 'مميز',
    duration: 14,
    price: 350,
    estimatedReach: 8000,
    features: [
      '14-day boost',
      'Advanced analytics & insights',
      'Full targeting (category, location, interests)',
      'Top placement in marketplace',
      'Notification push to buyers',
      'Featured listing badge',
    ],
    featuresAr: [
      'ترويج لمدة 14 يوم',
      'إحصائيات ورؤى متقدمة',
      'استهداف كامل (فئات، موقع، اهتمامات)',
      'أعلى ترتيب في السوق',
      'إشعار للمشترين المحتملين',
      'شارة إعلان مميز',
    ],
    tier: 'premium',
    color: 'from-orange-500 to-amber-600',
    icon: '👑',
    maxNotifications: 1500,
    includeMessages: true,
    targeting: 'interests',
  },
  {
    id: 'vip',
    name: 'VIP',
    nameAr: 'VIP',
    duration: 30,
    price: 700,
    estimatedReach: 25000,
    features: [
      '30-day boost',
      'Premium analytics with AI recommendations',
      'Full targeting + AI optimization',
      'Pinned to top of marketplace',
      'Notification push to buyers',
      'VIP featured badge',
      'Direct promotional messages',
      'Smart pricing suggestions',
    ],
    featuresAr: [
      'ترويج لمدة 30 يوم',
      'إحصائيات متميزة مع توصيات ذكية',
      'استهداف كامل + تحسين بالذكاء الاصطناعي',
      'تثبيت في أعلى السوق',
      'إشعار للمشترين المحتملين',
      'شارة VIP مميزة',
      'رسائل ترويجية مباشرة',
      'اقتراحات تسعير ذكية',
    ],
    tier: 'vip',
    color: 'from-amber-500 to-yellow-500',
    icon: '💎',
    maxNotifications: 5000,
    includeMessages: true,
    targeting: 'interests',
  },
];
