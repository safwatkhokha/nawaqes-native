/**
 * Central Interest Categories Configuration
 * All interest definitions across the app should reference this file
 * to ensure consistency between LoginPage, ProfilePage, CreatePost, MarketPage, etc.
 */

export interface InterestCategory {
  id: string;
  nameKey: string;          // i18n key for name
  descriptionKey: string;   // i18n key for description
  icon: string;             // emoji icon
  color: string;            // Tailwind gradient for card
  group: InterestGroup;
}

export type InterestGroup = 'tech' | 'vehicles' | 'lifestyle' | 'professional' | 'social' | 'other';

export interface InterestGroupInfo {
  id: InterestGroup;
  nameKey: string;    // i18n key
  icon: string;
}

export const interestGroups: InterestGroupInfo[] = [
  { id: 'tech', nameKey: 'interestGroups.tech', icon: '💻' },
  { id: 'vehicles', nameKey: 'interestGroups.vehicles', icon: '🚘' },
  { id: 'lifestyle', nameKey: 'interestGroups.lifestyle', icon: '✨' },
  { id: 'professional', nameKey: 'interestGroups.professional', icon: '💼' },
  { id: 'social', nameKey: 'interestGroups.social', icon: '🌐' },
  { id: 'other', nameKey: 'interestGroups.other', icon: '📦' },
];

export const interestCategories: InterestCategory[] = [
  // ─── Tech & Communication ───
  { id: 'phones', nameKey: 'interests.phones', descriptionKey: 'interestsDesc.phones', icon: '📱', color: 'from-blue-500 to-cyan-500', group: 'tech' },
  { id: 'electronics', nameKey: 'interests.electronics', descriptionKey: 'interestsDesc.electronics', icon: '💻', color: 'from-indigo-500 to-purple-500', group: 'tech' },
  { id: 'games', nameKey: 'interests.games', descriptionKey: 'interestsDesc.games', icon: '🎮', color: 'from-violet-500 to-fuchsia-500', group: 'tech' },

  // ─── Vehicles & Real Estate ───
  { id: 'cars', nameKey: 'interests.cars', descriptionKey: 'interestsDesc.cars', icon: '🚗', color: 'from-orange-500 to-red-500', group: 'vehicles' },
  { id: 'realEstate', nameKey: 'interests.realEstate', descriptionKey: 'interestsDesc.realEstate', icon: '🏠', color: 'from-emerald-500 to-teal-500', group: 'vehicles' },

  // ─── Lifestyle & Beauty ───
  { id: 'fashion', nameKey: 'interests.fashion', descriptionKey: 'interestsDesc.fashion', icon: '👕', color: 'from-pink-500 to-rose-500', group: 'lifestyle' },
  { id: 'beauty', nameKey: 'interests.beauty', descriptionKey: 'interestsDesc.beauty', icon: '💄', color: 'from-fuchsia-500 to-pink-500', group: 'lifestyle' },
  { id: 'sports', nameKey: 'interests.sports', descriptionKey: 'interestsDesc.sports', icon: '⚽', color: 'from-green-500 to-lime-500', group: 'lifestyle' },
  { id: 'food', nameKey: 'interests.food', descriptionKey: 'interestsDesc.food', icon: '🍽️', color: 'from-amber-500 to-yellow-500', group: 'lifestyle' },

  // ─── Professional ───
  { id: 'jobs', nameKey: 'interests.jobs', descriptionKey: 'interestsDesc.jobs', icon: '💼', color: 'from-sky-500 to-blue-500', group: 'professional' },
  { id: 'services', nameKey: 'interests.services', descriptionKey: 'interestsDesc.services', icon: '🛎️', color: 'from-teal-500 to-cyan-500', group: 'professional' },
  { id: 'education', nameKey: 'interests.education', descriptionKey: 'interestsDesc.education', icon: '🎓', color: 'from-cyan-500 to-sky-500', group: 'professional' },

  // ─── Social & Entertainment ───
  { id: 'books', nameKey: 'interests.books', descriptionKey: 'interestsDesc.books', icon: '📚', color: 'from-amber-600 to-orange-500', group: 'social' },
  { id: 'animals', nameKey: 'interests.animals', descriptionKey: 'interestsDesc.animals', icon: '🐾', color: 'from-lime-500 to-green-500', group: 'social' },
  { id: 'travel', nameKey: 'interests.travel', descriptionKey: 'interestsDesc.travel', icon: '✈️', color: 'from-sky-400 to-indigo-400', group: 'social' },
  { id: 'photography', nameKey: 'interests.photography', descriptionKey: 'interestsDesc.photography', icon: '📷', color: 'from-rose-500 to-red-400', group: 'social' },

  // ─── Other ───
  { id: 'health', nameKey: 'interests.health', descriptionKey: 'interestsDesc.health', icon: '🏥', color: 'from-red-500 to-pink-500', group: 'other' },
  { id: 'other', nameKey: 'interests.other', descriptionKey: 'interestsDesc.other', icon: '📦', color: 'from-gray-500 to-slate-500', group: 'other' },
];

/**
 * Get interests filtered by group
 */
export function getInterestsByGroup(group: InterestGroup): InterestCategory[] {
  return interestCategories.filter(i => i.group === group);
}

/**
 * Get all interest IDs
 */
export function getAllInterestIds(): string[] {
  return interestCategories.map(i => i.id);
}

/**
 * Get an interest by ID
 */
export function getInterestById(id: string): InterestCategory | undefined {
  return interestCategories.find(i => i.id === id);
}
