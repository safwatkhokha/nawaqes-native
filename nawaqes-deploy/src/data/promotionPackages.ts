// ─── Promotion Packages Data ──────────────────────────────────────
// Available promotion packages for boosting posts

export interface PromotionPackage {
  id: string;
  name: string;
  nameAr: string;
  duration: number; // days
  price: number; // EGP
  estimatedReach: number;
  features: string[];
  featuresAr: string[];
  tier: 'basic' | 'standard' | 'premium' | 'vip';
  color: string;
  icon: string;
  maxNotifications?: number;
  includeMessages?: boolean;
  targeting?: 'location' | 'interests' | 'all' | 'city';
  showBadge?: string;
  cityTargeting?: {
    minCities: number;
    maxCities: number;
    tiers: CityTargetingTier[];
  };
}

// ─── City Tiers for Location-Based Pricing ───────────────────
// City targeting pricing tier (used by city_target package)
export interface CityTargetingTier {
  minCities: number;
  maxCities: number;
  label: string;
  price: number;
  estimatedReach: number;
  maxNotifications: number;
}

export interface CityTier {
  id: string;
  name: string;
  nameAr: string;
  cities: string[]; // city IDs
  priceMultiplier: number; // multiplier on base package price
  label?: string;
  price?: number;
  estimatedReach?: number;
  maxNotifications?: number;
}

export const cityTiers: CityTier[] = [
  {
    id: 'tier1',
    name: 'Major Cities',
    nameAr: 'المدن الكبرى',
    cities: ['cairo', 'giza', 'alexandria', 'sharm', 'hurghada'],
    priceMultiplier: 1.0,
  },
  {
    id: 'tier2',
    name: 'Secondary Cities',
    nameAr: 'مدن الدرجة الثانية',
    cities: ['mansoura', 'tanta', 'zagazig', 'ismailia', 'suez', 'port_said', 'damietta', 'fayoum', 'beni_suef', 'minya'],
    priceMultiplier: 0.8,
  },
  {
    id: 'tier3',
    name: 'Other Cities',
    nameAr: 'مدن أخرى',
    cities: [],
    priceMultiplier: 0.6,
  },
];

/**
 * Get the city tier for a given city ID
 * Returns the CityTier object or the default (tier3) if not found
 */
export const getCityTier = (cityIdOrCount: string | number): CityTier | CityTargetingTier => {
  // If a number is passed, it's a city count for city_target pricing
  if (typeof cityIdOrCount === 'number') {
    const pkg = promotionPackages.find(p => p.id === 'city_target');
    if (pkg?.cityTargeting?.tiers) {
      const tiers = pkg.cityTargeting.tiers;
      const match = tiers.find(t => cityIdOrCount >= t.minCities && cityIdOrCount <= t.maxCities);
      return match || tiers[tiers.length - 1];
    }
    // Fallback: compute from cityTiers priceMultiplier
    const fallbackTier = cityTiers[0];
    return {
      ...fallbackTier,
      label: fallbackTier.nameAr,
      price: Math.round(100 * fallbackTier.priceMultiplier),
      estimatedReach: 500,
      maxNotifications: 50,
    };
  }
  // If a string is passed, it's a city ID lookup
  const tier = cityTiers.find(t => t.cities.includes(cityIdOrCount));
  return tier || cityTiers[cityTiers.length - 1]; // default to last tier (cheapest)
};

export const promotionPackages: PromotionPackage[] = [
  {
    id: 'basic',
    name: 'Basic',
    nameAr: 'أساسي',
    duration: 3,
    price: 50,
    estimatedReach: 500,
    features: ['3-day boost', 'Basic analytics', 'Category targeting'],
    featuresAr: ['ترويج لمدة 3 أيام', 'إحصائيات أساسية', 'استهداف فئات'],
    tier: 'basic',
    color: 'from-blue-500 to-blue-600',
    icon: '🚀',
    maxNotifications: 50,
    includeMessages: false,
    targeting: 'all',
  },
  {
    id: 'standard',
    name: 'Standard',
    nameAr: 'قياسي',
    duration: 7,
    price: 120,
    estimatedReach: 2000,
    features: ['7-day boost', 'Detailed analytics', 'Category & location targeting', 'Priority in feed'],
    featuresAr: ['ترويج لمدة 7 أيام', 'إحصائيات مفصلة', 'استهداف فئات وموقع', 'أولوية في الخلاصة'],
    tier: 'standard',
    color: 'from-purple-500 to-purple-600',
    icon: '⭐',
    maxNotifications: 200,
    includeMessages: false,
    targeting: 'location',
  },
  {
    id: 'premium',
    name: 'Premium',
    nameAr: 'مميز',
    duration: 14,
    price: 250,
    estimatedReach: 5000,
    features: ['14-day boost', 'Advanced analytics', 'Full targeting', 'Priority in feed', 'Notification push'],
    featuresAr: ['ترويج لمدة 14 يوم', 'إحصائيات متقدمة', 'استهداف كامل', 'أولوية في الخلاصة', 'إشعار للمستخدمين'],
    tier: 'premium',
    color: 'from-orange-500 to-amber-600',
    icon: '👑',
    maxNotifications: 500,
    includeMessages: true,
    targeting: 'interests',
    showBadge: 'promoted',
  },
  {
    id: 'vip',
    name: 'VIP',
    nameAr: 'VIP',
    duration: 30,
    price: 500,
    estimatedReach: 15000,
    features: ['30-day boost', 'Premium analytics', 'Full targeting + AI', 'Top of feed', 'Notification push', 'Featured badge', 'Smart link'],
    featuresAr: ['ترويج لمدة 30 يوم', 'إحصائيات متميزة', 'استهداف كامل + ذكاء اصطناعي', 'أعلى الخلاصة', 'إشعار للمستخدمين', 'شارة مميزة', 'رابط ذكي'],
    tier: 'vip',
    color: 'from-amber-500 to-yellow-500',
    icon: '💎',
    maxNotifications: 1000,
    includeMessages: true,
    targeting: 'interests',
    showBadge: 'vip',
  },
  {
    id: 'city_target',
    name: 'City Target',
    nameAr: 'استهداف مدن',
    duration: 7,
    price: 100,
    estimatedReach: 3000,
    features: ['7-day boost', 'City-based targeting', 'Up to 10 cities', 'Notification push'],
    featuresAr: ['ترويج لمدة 7 أيام', 'استهداف حسب المدينة', 'حتى 10 مدن', 'إشعار للمستخدمين'],
    tier: 'standard',
    color: 'from-teal-500 to-cyan-600',
    icon: '📍',
    maxNotifications: 300,
    includeMessages: true,
    targeting: 'city',
    cityTargeting: {
      minCities: 1,
      maxCities: 10,
      tiers: [
        { minCities: 1, maxCities: 2, label: '1-2 مدن', price: 100, estimatedReach: 1000, maxNotifications: 100 },
        { minCities: 3, maxCities: 5, label: '3-5 مدن', price: 200, estimatedReach: 3000, maxNotifications: 300 },
        { minCities: 6, maxCities: 10, label: '6-10 مدن', price: 350, estimatedReach: 6000, maxNotifications: 600 },
      ],
    },
  },
  {
    id: 'interest_target',
    name: 'Interest Target',
    nameAr: 'استهداف اهتمامات',
    duration: 7,
    price: 150,
    estimatedReach: 2500,
    features: ['7-day boost', 'Interest-based targeting', 'Smart matching', 'Notification push'],
    featuresAr: ['ترويج لمدة 7 أيام', 'استهداف حسب الاهتمامات', 'مطابقة ذكية', 'إشعار للمستخدمين'],
    tier: 'standard',
    color: 'from-indigo-500 to-violet-600',
    icon: '🎯',
    maxNotifications: 250,
    includeMessages: true,
    targeting: 'interests',
  },
];
