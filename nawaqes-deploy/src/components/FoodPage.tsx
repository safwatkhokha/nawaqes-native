// ─── هتاكل — Food & Drink Marketplace ───────────────────────────────
// Displays posts with type='food' in a card grid with food categories
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import {
  ArrowRight, UtensilsCrossed, Search, MapPin, Clock, Star,
  Truck, Flame, Plus, RefreshCw, Heart, MessageCircle, Eye,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from '../lib/silentToast';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { parseDBTimestamp } from '../utils/time';
import { useSafeBack } from '../hooks/useSafeBack';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

const FOOD_CATEGORIES = [
  { id: 'all', label: 'الكل', icon: '🍽️' },
  { id: 'meals', label: 'وجبات', icon: '🍔' },
  { id: 'desserts', label: 'حلويات', icon: '🍰' },
  { id: 'drinks', label: 'مشروبات', icon: '🥤' },
  { id: 'groceries', label: 'مكونات', icon: '🛒' },
  { id: 'restaurants', label: 'مطاعم', icon: '🏪' },
];

export const FoodPage: React.FC = () => {
  const navigate = useNavigate();
  const { darkMode } = useAppContext();
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { dir } = useLanguage();
  const safeBack = useSafeBack();

  const [foodPosts, setFoodPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const cardBg = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100';

  const loadFood = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getPosts({ limit: '50', type: 'food' }).catch(() => ({ posts: [] }));
      const posts = (data as any)?.posts || (data as any) || [];
      setFoodPosts(posts);
    } catch {
      setFoodPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFood(); }, [loadFood]);

  // Pull to refresh
  const { pullDistance, isRefreshing, touchHandlers, setScrollRef } = usePullToRefresh({
    onRefresh: async () => { await loadFood(); },
  });

  const filteredPosts = foodPosts.filter(p => {
    if (category !== 'all' && p.category !== category) return false;
    if (searchQuery && !p.content?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Check if restaurant is open
  const isOpenNow = (workingHours?: string) => {
    if (!workingHours) return true; // default open
    return true; // simplified — can parse hours later
  };

  return (
    <div className="w-full max-w-md lg:max-w-2xl xl:max-w-4xl mx-auto" dir={dir}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-3 px-1">
        <button
          onClick={safeBack}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className={`text-xl font-black flex items-center gap-2 ${textPrimary}`}>
            <UtensilsCrossed className="w-5 h-5 text-orange-500" />
            هتاكل
          </h1>
          <p className={`text-[10px] ${textMuted}`}>أكل · شرب · حلويات · توصيل</p>
        </div>
        {/* 🍔 Prominent "أضف إعلان" button in the header — pre-fills the
            create-post modal with postType='food' so the food-specific
            fields (delivery, working hours, prep time, contact phone) are
            shown automatically. */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('nawaqes-create-post', { detail: { postType: 'food' } }))}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-l from-orange-500 to-amber-500 text-white text-xs font-bold shadow-md shadow-orange-500/20 hover:shadow-lg hover:shadow-orange-500/30 active:scale-95 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">أضف إعلان</span>
          <span className="sm:hidden">إعلان</span>
        </button>
        <button
          onClick={loadFood}
          className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
        >
          <RefreshCw className={`w-4 h-4 ${textMuted}`} />
        </button>
      </div>

      {/* Search */}
      <div className={`flex items-center gap-2 rounded-xl px-3 py-2 mb-3 ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
        <Search className={`w-4 h-4 ${textMuted}`} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث عن طبق، مطعم، أو مشروب..."
          className={`flex-1 bg-transparent border-none outline-none text-sm ${textPrimary} placeholder:${textMuted}`}
        />
      </div>

      {/* Category Pills */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 scrollbar-hide">
        {FOOD_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all ${
              category === cat.id
                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
                : darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span className="text-xs">{cat.icon}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div
        ref={setScrollRef}
        {...touchHandlers}
        className="overflow-y-auto pb-20"
        style={{ maxHeight: 'calc(100vh - 200px)' }}
      >
        {/* Pull to refresh indicator */}
        {(pullDistance > 0 || isRefreshing) && (
          <div className="flex flex-col items-center justify-center py-2" style={{ opacity: pullDistance / 70 }}>
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin text-orange-500' : textMuted}`} />
            <span className={`text-[10px] font-bold mt-1 ${textMuted}`}>
              {isRefreshing ? 'جاري التحديث...' : 'اسحب للتحديث'}
            </span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className={`rounded-2xl border p-8 text-center ${cardBg}`}>
            <UtensilsCrossed className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} />
            <p className={`text-sm font-bold mb-1 ${textPrimary}`}>لا توجد إعلانات طعام حالياً</p>
            <p className={`text-xs ${textMuted} mb-4`}>كن أول من يضيف طبقه هنا!</p>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('nawaqes-create-post', { detail: { postType: 'food' } }))}
              className="px-6 py-2.5 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600 transition-colors"
            >
              + أضف طبق
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredPosts.map((post, idx) => {
              const images = (() => {
                try {
                  const parsed = JSON.parse(post.image || '[]');
                  return Array.isArray(parsed) ? parsed : [post.image];
                } catch { return [post.image]; }
              })().filter(Boolean);

              return (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => navigate(`/post/${post.id}`)}
                  className={`rounded-2xl border overflow-hidden cursor-pointer transition-all hover:shadow-lg ${cardBg}`}
                >
                  {/* Image */}
                  {images.length > 0 ? (
                    <div className={`relative h-40 overflow-hidden ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
                      <img
                        src={images[0]}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {/* Open/Closed badge */}
                      {isOpenNow(post.working_hours) ? (
                        <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-green-500 text-white text-[9px] font-black flex items-center gap-0.5">
                          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> مفتوح
                        </span>
                      ) : (
                        <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-red-500 text-white text-[9px] font-black">
                          مغلق
                        </span>
                      )}
                      {/* Delivery badge */}
                      {post.delivery_available && (
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-blue-500 text-white text-[9px] font-bold flex items-center gap-0.5">
                          <Truck className="w-2.5 h-2.5" /> توصيل
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className={`h-40 flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
                      <UtensilsCrossed className="w-10 h-10 text-gray-400" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="p-3">
                    <h4 className={`text-sm font-black truncate mb-1 ${textPrimary}`}>
                      {post.content?.split('\n')[0] || 'طبق'}
                    </h4>
                    {post.content?.split('\n')[1] && (
                      <p className={`text-[10px] line-clamp-1 mb-1.5 ${textMuted}`}>
                        {post.content.split('\n').slice(1).join(' ')}
                      </p>
                    )}

                    {/* Price + Location */}
                    <div className="flex items-center gap-2 mb-1.5">
                      {post.price && (
                        <span className="text-sm font-black text-orange-500">
                          {Number(post.price).toLocaleString('ar-EG')} {post.currency || 'ج.م'}
                        </span>
                      )}
                      {post.delivery_fee && (
                        <span className={`text-[9px] ${textMuted}`}>
                          + {Number(post.delivery_fee).toLocaleString('ar-EG')} توصيل
                        </span>
                      )}
                    </div>

                    {/* Location + Time */}
                    <div className="flex items-center gap-2 text-[9px]" style={{ color: darkMode ? '#9CA3AF' : '#6B7280' }}>
                      {post.location && (
                        <span className="flex items-center gap-0.5">
                          <MapPin className="w-2.5 h-2.5" /> {post.location}
                        </span>
                      )}
                      {post.working_hours && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" /> {post.working_hours}
                        </span>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-3 mt-2 pt-2 border-t" style={{ borderColor: darkMode ? '#374151' : '#f3f4f6' }}>
                      <span className="flex items-center gap-0.5 text-[9px] font-bold" style={{ color: darkMode ? '#9CA3AF' : '#6B7280' }}>
                        <Heart className="w-2.5 h-2.5" /> {post.likes || 0}
                      </span>
                      <span className="flex items-center gap-0.5 text-[9px] font-bold" style={{ color: darkMode ? '#9CA3AF' : '#6B7280' }}>
                        <MessageCircle className="w-2.5 h-2.5" /> {post.comments || 0}
                      </span>
                      <span className="flex items-center gap-0.5 text-[9px] font-bold" style={{ color: darkMode ? '#9CA3AF' : '#6B7280' }}>
                        <Eye className="w-2.5 h-2.5" /> {post.reachCount || 0}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Add Button */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileTap={{ scale: 0.9 }}
        whileHover={{ scale: 1.08 }}
        onClick={() => window.dispatchEvent(new CustomEvent('nawaqes-create-post', { detail: { postType: 'food' } }))}
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-50 w-16 h-16 rounded-full flex items-center justify-center text-white shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, #f97316, #f59e0b)',
          boxShadow: '0 6px 24px rgba(249, 115, 22, 0.5)',
        }}
        title="أضف طبق"
      >
        <Plus className="w-7 h-7" />
        <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'rgba(249, 115, 22, 0.3)', animationDuration: '2s' }} />
      </motion.button>
    </div>
  );
};
