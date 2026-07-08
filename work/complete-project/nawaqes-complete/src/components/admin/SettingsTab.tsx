import React from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Cog } from 'lucide-react';
import { toast } from '../../lib/silentToast';
import { adminFetch, inputClass } from './helpers';
import { SiteSettings } from './types';
import { Btn } from './shared';

interface SettingsTabProps {
  siteSettings: SiteSettings;
  setSiteSettings: React.Dispatch<React.SetStateAction<SiteSettings>>;
  loadSettings: () => void;
  darkMode: boolean;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ siteSettings, setSiteSettings, loadSettings, darkMode }) => {
  const { t } = useTranslation();
  const saveSettings = async () => {
    try {
      await adminFetch('PUT', '/admin/settings', {
        siteName: siteSettings.siteName,
        maintenanceMode: siteSettings.maintenanceMode,
        maxUploadSize: siteSettings.maxUploadSize,
        defaultWalletBalance: siteSettings.defaultWalletBalance,
      });
      toast.success(t('admin.settingsSaved'));
    } catch { toast.error(t('admin.settingsSaveFailed')); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-6 space-y-5`}>
        <h3 className={`text-sm font-black flex items-center gap-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
          <Cog className="w-4 h-4 text-orange-500" />{t('admin.siteSettings')}
        </h3>
        <div className="space-y-4">
          <div>
            <label className={`text-xs font-bold mb-1 block ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('admin.siteName')}</label>
            <input value={siteSettings.siteName} onChange={e => setSiteSettings(s => ({ ...s, siteName: e.target.value }))} className={inputClass(darkMode)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <label className={`text-xs font-bold ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('admin.maintenanceMode')}</label>
              <p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('admin.maintenanceModeDesc')}</p>
            </div>
            <button onClick={() => setSiteSettings(s => ({ ...s, maintenanceMode: !s.maintenanceMode }))} className={`w-12 h-7 rounded-full transition-all ${siteSettings.maintenanceMode ? 'bg-orange-500' : darkMode ? 'bg-gray-600' : 'bg-gray-200'}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-all ${siteSettings.maintenanceMode ? 'translate-x-[22px]' : 'translate-x-1'}`} />
            </button>
          </div>
          <div>
            <label className={`text-xs font-bold mb-1 block ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('admin.maxUploadSize')}</label>
            <input type="number" value={siteSettings.maxUploadSize} onChange={e => setSiteSettings(s => ({ ...s, maxUploadSize: parseInt(e.target.value) || 5 }))} className={inputClass(darkMode)} />
          </div>
          <div>
            <label className={`text-xs font-bold mb-1 block ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('admin.defaultWalletBalance')}</label>
            <input type="number" value={siteSettings.defaultWalletBalance} onChange={e => setSiteSettings(s => ({ ...s, defaultWalletBalance: parseFloat(e.target.value) || 0 }))} className={inputClass(darkMode)} />
          </div>
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <Btn darkMode={darkMode} variant="outline" onClick={loadSettings}>{t('admin.restore')}</Btn>
          <Btn darkMode={darkMode} variant="primary" onClick={saveSettings}><Save className="w-4 h-4" />{t('admin.saveSettings')}</Btn>
        </div>
      </div>
    </div>
  );
};
