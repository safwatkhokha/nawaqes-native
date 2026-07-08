// ─── Admin: Market Listings Management Tab ──────────────────────────
// Allows admins to browse, search, feature, and delete all market
// listings across the platform.

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Star, Trash2, Eye, Loader2, Package, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '../../services/api';
import { useAppContext } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { parseDBTimestamp } from '../../utils/time';

interface MarketListing {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  condition: string;
  location: string;
  city: string;
  status: string;
  is_featured: number;
  is_promoted: number;
  promotion_status: string | null;
  views_count: number;
  saves_count: number;
  inquiries_count: number;
  created_at: string;
  updated_at: string;
  seller_name: string;
  seller_avatar: string;
  seller_phone: string;
  images?: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'نشط', color: 'bg-green-100 text-green-700' },
  paused: { label: 'متوقف', color: 'bg-yellow-100 text-yellow-700' },
  sold: { label: 'مباع', color: 'bg-blue-100 text-blue-700' },
  deleted: { label: 'محذوف', color: 'bg-red-100 text-red-700' },
};

export const MarketListingsTab: React.FC = () => {
  const { darkMode } = useAppContext();
  const { dir } = useLanguage();
  const navigate = useNavigate();
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadListings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAdminMarketListings(statusFilter || undefined, search || undefined);
      setListings(Array.isArray(data) ? data : []);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    const debounce = setTimeout(loadListings, 300);
    return () => clearTimeout(debounce);
  }, [loadListings]);

  const handleFeature = async (id: string) => {
    setActionLoading(id);
    try {
      const result = await api.toggleAdminMarketListingFeature(id);
      setListings(prev => prev.map(l => l.id === id ? { ...l, is_featured: result.is_featured ? 1 : 0 } : l));
    } catch {}
    setActionLoading(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الإعلان؟')) return;
    setActionLoading(id);
    try {
      await api.deleteAdminMarketListing(id);
      setListings(prev => prev.map(l => l.id === id ? { ...l, status: 'deleted' } : l));
    } catch {}
    setActionLoading(null);
  };

  const parseImages = (imagesStr?: string): string[] => {
    if (!imagesStr) return [];
    try { return JSON.parse(imagesStr); } catch { return []; }
  };

  const bgCard = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-300' : 'text-gray-700';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="space-y-4" dir={dir}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className={`text-xl font-black ${textPrimary}`}>إدارة إعلانات السوق الذكي</h2>
        <span className={`text-sm ${textMuted}`}>{listings.length} إعلان</span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${bgCard}`}>
          <Search className={`w-4 h-4 ${textMuted}`} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالعنوان أو الوصف..."
            className={`bg-transparent text-sm ${textPrimary} outline-none w-48`}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`px-3 py-2 rounded-xl border text-sm ${bgCard} ${textPrimary}`}
        >
          <option value="">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="paused">متوقف</option>
          <option value="sold">مباع</option>
          <option value="deleted">محذوف</option>
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!loading && listings.length === 0 && (
        <div className={`rounded-xl border p-8 text-center ${bgCard}`}>
          <Package className={`w-12 h-12 mx-auto mb-3 ${textMuted}`} />
          <p className={textMuted}>لا توجد إعلانات</p>
        </div>
      )}

      {/* Listings */}
      {!loading && listings.length > 0 && (
        <div className="space-y-2">
          {listings.map((listing) => {
            const images = parseImages(listing.images);
            const statusInfo = STATUS_LABELS[listing.status] || STATUS_LABELS.active;
            return (
              <motion.div
                key={listing.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl border p-3 ${bgCard} ${listing.status === 'deleted' ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {/* Image */}
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200 shrink-0">
                    {images[0] ? (
                      <img src={images[0]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`font-bold text-sm ${textPrimary} truncate`}>{listing.title}</h3>
                      {listing.is_featured ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-bold flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5 fill-yellow-500 text-yellow-500" />
                          مميز
                        </span>
                      ) : null}
                      {listing.is_promoted && listing.promotion_status === 'approved' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-bold">
                          مُروّج
                        </span>
                      )}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <div className={`text-xs mt-1 ${textMuted}`}>
                      {listing.price?.toLocaleString()} {listing.currency || 'ج.م'}
                      {' · '}
                      {listing.category || 'غير محدد'}
                      {' · '}
                      {listing.city || listing.location || 'غير محدد'}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${textMuted}`}>
                      البائع: {listing.seller_name || 'غير معروف'}
                      {listing.seller_phone && ` · ${listing.seller_phone}`}
                      {' · '}إصدار: {parseDBTimestamp(listing.created_at).toLocaleDateString('ar-EG')}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${textMuted}`}>
                      👁 {listing.views_count || 0} · 🔖 {listing.saves_count || 0} · 💬 {listing.inquiries_count || 0}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* View */}
                    <button
                      onClick={() => navigate(`/market/listing/${listing.id}`)}
                      className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                      title="عرض"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {/* Feature toggle */}
                    <button
                      onClick={() => handleFeature(listing.id)}
                      disabled={actionLoading === listing.id}
                      className={`p-2 rounded-lg transition-colors ${
                        listing.is_featured
                          ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200'
                          : darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
                      }`}
                      title={listing.is_featured ? 'إلغاء التمييز' : 'تمييز'}
                    >
                      {actionLoading === listing.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Star className={`w-4 h-4 ${listing.is_featured ? 'fill-yellow-500' : ''}`} />
                      )}
                    </button>

                    {/* Delete (admin only — soft delete) */}
                    {listing.status !== 'deleted' && (
                      <button
                        onClick={() => handleDelete(listing.id)}
                        disabled={actionLoading === listing.id}
                        className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-50 text-red-500'}`}
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};
