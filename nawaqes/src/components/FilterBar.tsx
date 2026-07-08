import React from 'react';
import { Filter, MapPin, DollarSign, Tag, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../contexts/LanguageContext';
import { egyptianCities, regionLabels, regionOrder } from '../data/egyptianCities';

interface FilterBarProps {
  filters: {
    minPrice: string;
    maxPrice: string;
    location: string;
    type: string;
  };
  setFilters: (filters: any) => void;
  onClear: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({ filters, setFilters, onClear }) => {
  const { t } = useTranslation();
  const { dir } = useLanguage();
  const [isOpen, setIsOpen] = React.useState(false);

  const locations = egyptianCities.filter(c => c.isGovernorate).map(c => c.nameAr);
  const types = [
    { id: "all", label: t('common.all') },
    { id: "ad", label: t('filterBar.ads') },
    { id: "news", label: t('filterBar.news') },
    { id: "status", label: t('filterBar.statuses') },
  ];

  const activeFiltersCount = Object.values(filters).filter(v => v !== "" && v !== "all").length;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6 overflow-hidden">
      <div 
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-50 text-orange-600 rounded-xl">
            <Filter className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-black text-gray-900">{t('filterBar.smartFilter')}</h4>
            <p className="text-[10px] text-gray-500">{t('filterBar.smartFilterDesc')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeFiltersCount > 0 && (
            <span className="bg-orange-600 text-white text-[10px] font-black px-2 py-1 rounded-full">
              {activeFiltersCount}
            </span>
          )}
          <div className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
            <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1.5L6 6.5L11 1.5" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>

      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[500px] border-t border-gray-50' : 'max-h-0'}`}>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Price Range */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 px-1">
              <DollarSign className="w-3 h-3" />
              {t('filterBar.priceRange')}
            </label>
            <div className="flex items-center gap-2">
              <input 
                type="number" 
                placeholder={t('filterBar.from')}
                value={filters.minPrice}
                onChange={(e) => setFilters({...filters, minPrice: e.target.value})}
                className="w-full bg-gray-50 border-none rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-orange-100"
              />
              <input 
                type="number" 
                placeholder={t('filterBar.to')}
                value={filters.maxPrice}
                onChange={(e) => setFilters({...filters, maxPrice: e.target.value})}
                className="w-full bg-gray-50 border-none rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-orange-100"
              />
            </div>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 px-1">
              <MapPin className="w-3 h-3" />
              {t('filterBar.geographicLocation')}
            </label>
            <select 
              value={filters.location}
              onChange={(e) => setFilters({...filters, location: e.target.value})}
              className="w-full bg-gray-50 border-none rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-orange-100 appearance-none"
            >
              <option value="">{t('filterBar.allAreas')}</option>
              {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </div>

          {/* Ad Type */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 px-1">
              <Tag className="w-3 h-3" />
              {t('filterBar.postType')}
            </label>
            <div className="flex gap-1 bg-gray-50 p-1 rounded-xl">
              {types.map(typeItem => (
                <button
                  key={typeItem.id}
                  onClick={() => setFilters({...filters, type: typeItem.id})}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    filters.type === typeItem.id ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {typeItem.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-end gap-2">
            <button 
              onClick={onClear}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
            >
              <X className="w-4 h-4" />
              {t('filterBar.clearFilter')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
