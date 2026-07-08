import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Edit3, Trash2 } from 'lucide-react';
import { toast } from '../../lib/silentToast';
import { adminFetch } from './helpers';
import { Badge, Btn } from './shared';

interface CategoriesTabProps {
  allCategories: any[];
  loadCategories: () => void;
  darkMode: boolean;
}

export const CategoriesTab: React.FC<CategoriesTabProps> = ({ allCategories, loadCategories, darkMode }) => {
  const { t } = useTranslation();
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  const addCategoryHandler = async () => {
    if (!catName.trim()) { toast.error(t('admin.enterCategoryName')); return; }
    try { await adminFetch('POST', '/admin/categories', { name: catName.trim(), icon: catIcon.trim() || '📁' }); setCatName(''); setCatIcon(''); loadCategories(); toast.success(t('admin.categoryAdded')); } catch { toast.error(t('admin.categoryAddFailed')); }
  };
  const updateCategoryHandler = async (catId: string) => {
    if (!catName.trim()) { toast.error(t('admin.enterCategoryName')); return; }
    try { await adminFetch('PUT', `/admin/categories/${catId}`, { name: catName.trim(), icon: catIcon.trim() || '📁' }); setCatName(''); setCatIcon(''); setEditingCatId(null); loadCategories(); toast.success(t('admin.categoryUpdated')); } catch { toast.error(t('admin.categoryUpdateFailed')); }
  };
  const deleteCategoryHandler = async (catId: string) => {
    if (!confirm(t('admin.confirmDeleteCategory'))) return;
    try { await adminFetch('DELETE', `/admin/categories/${catId}`); loadCategories(); toast.success(t('admin.categoryDeleted')); } catch { toast.error(t('admin.categoryDeleteFailed')); }
  };

  return (
    <div className="space-y-4">
      {/* Add/Edit Form */}
      <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-5`}>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'} mb-1 block`}>{t('admin.categoryName')}</label>
            <input value={catName} onChange={e => setCatName(e.target.value)} placeholder={t('admin.categoryName')} className={`w-full px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
          </div>
          <div className="w-24">
            <label className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'} mb-1 block`}>{t('admin.icon')}</label>
            <input value={catIcon} onChange={e => setCatIcon(e.target.value)} placeholder="📁" className={`w-full px-3 py-2 rounded-xl border text-sm text-center ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
          </div>
          <Btn darkMode={darkMode} variant="primary" onClick={editingCatId ? () => updateCategoryHandler(editingCatId) : addCategoryHandler}>{editingCatId ? t('admin.update') : t('admin.add')}</Btn>
          {editingCatId && <Btn darkMode={darkMode} variant="outline" onClick={() => { setEditingCatId(null); setCatName(''); setCatIcon(''); }}>{t('common.cancel')}</Btn>}
        </div>
      </div>

      {/* Category List */}
      <div className="grid gap-2 max-h-[calc(100vh-300px)] overflow-y-auto custom-scrollbar">
        {[...allCategories].sort((a: any, b: any) => (a.sort || 0) - (b.sort || 0)).map((c: any) => (
          <div key={c.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-xl border p-3 flex items-center gap-3`}>
            <span className="text-xl">{c.icon || '📁'}</span>
            <span className={`font-bold text-sm flex-1 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>{c.name}</span>
            <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => { setEditingCatId(c.id); setCatName(c.name); setCatIcon(c.icon || ''); }}><Edit3 className="w-3 h-3" /></Btn>
            <Btn darkMode={darkMode} size="xs" variant="danger" onClick={() => deleteCategoryHandler(c.id)}><Trash2 className="w-3 h-3" /></Btn>
          </div>
        ))}
      </div>
    </div>
  );
};
