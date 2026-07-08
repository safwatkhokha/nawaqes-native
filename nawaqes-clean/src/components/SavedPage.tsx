import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { PostCard } from './PostCard';
import {
  ArrowRight,
  Bookmark,
  ShoppingBag,
  Search,
  Grid3X3,
  List,
  Filter,
  FolderOpen,
  Tag,
  Clock,
  TrendingUp,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { parseDBTimestamp } from '../utils/time';
import { useSafeBack } from '../hooks/useSafeBack';

export const SavedPage: React.FC = () => {
  const navigate = useNavigate();
  const safeBack = useSafeBack();
  const { darkMode, posts, savedPosts, toggleSavePost } = useAppContext();
  const { t } = useTranslation();
  const { dir } = useLanguage();

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'ad' | 'status' | 'news'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'price_low' | 'price_high'>('newest');

  const savedPostsList = useMemo(() => {
    let result = posts.filter(p => savedPosts.includes(p.id));

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.content.toLowerCase().includes(q) ||
        p.author.name.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    }

    // Type filter
    if (filterType !== 'all') {
      result = result.filter(p => p.type === filterType);
    }

    // Sort
    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => parseDBTimestamp(b.timestamp).getTime() - parseDBTimestamp(a.timestamp).getTime());
        break;
      case 'oldest':
        result.sort((a, b) => parseDBTimestamp(a.timestamp).getTime() - parseDBTimestamp(b.timestamp).getTime());
        break;
      case 'price_low':
        result.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'price_high':
        result.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
    }

    return result;
  }, [posts, savedPosts, searchQuery, filterType, sortBy]);

  // Group by category
  const categoryGroups = useMemo(() => {
    const groups: Record<string, number> = {};
    savedPostsList.forEach(p => {
      const cat = p.category || 'other';
      groups[cat] = (groups[cat] || 0) + 1;
    });
    return Object.entries(groups).sort(([, a], [, b]) => b - a);
  }, [savedPostsList]);

  const bgCard = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const bgSection = darkMode ? 'bg-gray-700/50' : 'bg-gray-50';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-300' : 'text-gray-700';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="max-w-2xl mx-auto" dir={dir}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => safeBack()}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className={`text-2xl font-black ${textPrimary}`}>
            {t('saved.title')}
          </h1>
          <p className={`text-sm ${textMuted}`}>
            {t('saved.savedCount', { count: savedPostsList.length })}
          </p>
        </div>
        {savedPostsList.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? (darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-900') : textMuted}`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? (darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-900') : textMuted}`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Stats & Search */}
      {savedPosts.length > 0 && (
        <>
          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className={`rounded-xl border p-3 text-center ${bgCard}`}>
              <Bookmark className={`w-4 h-4 mx-auto mb-1 ${darkMode ? 'text-orange-400' : 'text-orange-600'}`} />
              <p className={`text-lg font-black ${textPrimary}`}>{savedPosts.length}</p>
              <p className={`text-[9px] font-bold ${textMuted}`}>{t('saved.totalSaved')}</p>
            </div>
            <div className={`rounded-xl border p-3 text-center ${bgCard}`}>
              <Tag className={`w-4 h-4 mx-auto mb-1 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              <p className={`text-lg font-black ${textPrimary}`}>{categoryGroups.length}</p>
              <p className={`text-[9px] font-bold ${textMuted}`}>{t('saved.categories')}</p>
            </div>
            <div className={`rounded-xl border p-3 text-center ${bgCard}`}>
              <ShoppingBag className={`w-4 h-4 mx-auto mb-1 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
              <p className={`text-lg font-black ${textPrimary}`}>
                {savedPostsList.filter(p => p.price).length}
              </p>
              <p className={`text-[9px] font-bold ${textMuted}`}>{t('saved.withPrice')}</p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative mb-4">
            <Search className={`absolute top-3 right-3 w-4 h-4 ${textMuted}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('saved.searchPlaceholder')}
              className={`w-full rounded-xl border px-4 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-orange-500/30 ${
                darkMode ? 'bg-gray-800 border-gray-700 text-white placeholder:text-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute top-3 left-3"
              >
                <X className={`w-4 h-4 ${textMuted}`} />
              </button>
            )}
          </div>

          {/* Filter & Sort */}
          <div className="flex items-center gap-2 mb-4 overflow-x-auto hide-scrollbar">
            {/* Type filters */}
            {[
              { id: 'all' as const, label: t('common.all') },
              { id: 'ad' as const, label: t('saved.adsOnly') },
              { id: 'status' as const, label: t('saved.statuses') },
              { id: 'news' as const, label: t('saved.news') },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilterType(f.id)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition-colors ${
                  filterType === f.id
                    ? 'bg-orange-600 text-white'
                    : darkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {f.label}
              </button>
            ))}

            <div className={`w-px h-4 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`} />

            {/* Sort */}
            {[
              { id: 'newest' as const, label: t('saved.sortNewest') },
              { id: 'price_low' as const, label: t('saved.sortPriceLow') },
              { id: 'price_high' as const, label: t('saved.sortPriceHigh') },
            ].map(s => (
              <button
                key={s.id}
                onClick={() => setSortBy(s.id)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition-colors ${
                  sortBy === s.id
                    ? 'bg-blue-600 text-white'
                    : darkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Category Tags */}
      {categoryGroups.length > 1 && (
        <div className={`rounded-xl p-3 mb-4 border ${bgCard}`}>
          <div className="flex items-center gap-2 mb-2">
            <FolderOpen className={`w-3.5 h-3.5 ${textMuted}`} />
            <span className={`text-[10px] font-bold ${textMuted}`}>{t('saved.byCategory')}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {categoryGroups.map(([cat, count]) => (
              <span
                key={cat}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                  darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {t(`interests.${cat}`, cat)} ({count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Saved Posts */}
      {savedPostsList.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-3">
            {savedPostsList.map(post => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <motion.div layout className="space-y-4">
            {savedPostsList.map(post => (
              <PostCard key={post.id} post={post} />
            ))}
          </motion.div>
        )
      ) : (
        <div className={`p-12 text-center rounded-2xl border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
            <Bookmark className={`w-10 h-10 ${textMuted}`} />
          </div>
          <h3 className={`font-black text-lg mb-2 ${textPrimary}`}>
            {searchQuery || filterType !== 'all' ? t('saved.noFilterResults') : t('saved.noSaved')}
          </h3>
          <p className={`text-sm mb-6 max-w-xs mx-auto ${textMuted}`}>
            {searchQuery || filterType !== 'all' ? t('saved.tryDifferentFilter') : t('saved.noSavedDesc')}
          </p>
          {!searchQuery && filterType === 'all' && (
            <button
              onClick={() => navigate('/market')}
              className="bg-orange-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-orange-700 active:scale-95 transition-all flex items-center gap-2 mx-auto"
            >
              <ShoppingBag className="w-4 h-4" />
              {t('saved.browseMarket')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
