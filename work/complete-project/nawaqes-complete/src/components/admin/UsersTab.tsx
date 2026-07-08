import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, UserCheck, Shield, Star, Ban, Trash2, Eye, Check, Wallet, Calendar, Info, Users } from 'lucide-react';
import { toast } from '../../lib/silentToast';
import { api } from '../../services/api';
import { adminFetch, formatTimeAgo, inputClass, selectClass } from './helpers';
import { AdminUser } from './types';
import { Badge, Btn, Modal, EmptyState } from './shared';

interface UsersTabProps {
  allUsers: AdminUser[];
  setAllUsers: React.Dispatch<React.SetStateAction<AdminUser[]>>;
  loadUsers: () => void;
  darkMode: boolean;
}

export const UsersTab: React.FC<UsersTabProps> = ({ allUsers, loadUsers, darkMode }) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'verified' | 'admin' | 'deactivated' | 'trusted'>('all');
  const [userSort, setUserSort] = useState<'name' | 'joinDate' | 'wallet' | 'trust'>('joinDate');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [userDetail, setUserDetail] = useState<any>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [walletAmount, setWalletAmount] = useState('');
  const [walletReason, setWalletReason] = useState('');
  const [warningReason, setWarningReason] = useState('');

  const filteredUsers = useMemo(() => {
    let r = allUsers.filter(u => u.name.includes(searchQuery) || u.email.includes(searchQuery) || u.phone?.includes(searchQuery));
    if (userFilter === 'verified') r = r.filter(u => u.isVerified);
    if (userFilter === 'admin') r = r.filter(u => u.isAdmin);
    if (userFilter === 'deactivated') r = r.filter(u => u.isDeactivated);
    if (userFilter === 'trusted') r = r.filter(u => u.isTrusted);
    if (userSort === 'name') r.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    if (userSort === 'wallet') r.sort((a, b) => b.walletBalance - a.walletBalance);
    if (userSort === 'trust') r.sort((a, b) => b.trustScore - a.trustScore);
    return r;
  }, [allUsers, searchQuery, userFilter, userSort]);

  const loadUserDetail = async (userId: string) => {
    try {
      const data = await adminFetch('GET', `/admin/user-details/${userId}`);
      setUserDetail(data);
    } catch {
      setUserDetail(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm(t('admin.confirmDeleteUser'))) return;
    try { await api.deleteUser(userId); loadUsers(); toast.success(t('admin.userDeleted')); } catch { toast.error(t('admin.userDeleteFailed')); }
  };
  const toggleVerify = async (userId: string) => {
    try { await api.toggleUserVerification(userId); loadUsers(); toast.success(t('admin.verificationUpdated')); } catch { toast.error(t('admin.verificationUpdateFailed')); }
  };
  const toggleAdmin = async (userId: string) => {
    try { await adminFetch('PATCH', `/admin/users/${userId}/toggle-admin`); loadUsers(); toast.success(t('admin.adminRightsUpdated')); } catch { toast.error(t('admin.adminRightsUpdateFailed')); }
  };
  const toggleActive = async (userId: string) => {
    try { await adminFetch('PATCH', `/admin/users/${userId}/toggle-active`); loadUsers(); toast.success(t('admin.accountStatusUpdated')); } catch { toast.error(t('admin.accountStatusUpdateFailed')); }
  };
  const toggleTrusted = async (userId: string) => {
    try { await adminFetch('PATCH', `/admin/users/${userId}/toggle-trusted`); loadUsers(); toast.success(t('admin.trustedStatusUpdated')); } catch { toast.error(t('admin.trustedStatusUpdateFailed')); }
  };
  const sendWarning = async (userId: string) => {
    try { await adminFetch('POST', `/admin/users/${userId}/send-warning`, { reason: warningReason || '' }); setWarningReason(''); toast.success(t('admin.warningSent')); } catch { toast.error(t('admin.warningSendFailed')); }
  };
  const adjustWallet = async (userId: string) => {
    const amount = parseFloat(walletAmount);
    if (isNaN(amount) || amount === 0) { toast.error(t('admin.enterValidAmount')); return; }
    try {
      await adminFetch('POST', `/admin/users/${userId}/adjust-wallet`, { amount, reason: walletReason || t('admin.manualAdjustmentByAdmin') });
      loadUsers(); setWalletAmount(''); setWalletReason('');
      toast.success(t('admin.walletAdjusted', { amount: `${amount > 0 ? '+' : ''}${amount}` }));
    } catch { toast.error(t('admin.walletAdjustFailed')); }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-300" />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={t('admin.searchUsers')} className={inputClass(darkMode) + ' pr-10'} />
        </div>
        <select value={userFilter} onChange={e => setUserFilter(e.target.value as any)} className={selectClass(darkMode)}>
          <option value="all">{t('common.all')}</option><option value="verified">{t('admin.verified')}</option><option value="admin">{t('admin.admins')}</option><option value="deactivated">{t('admin.deactivated')}</option><option value="trusted">{t('admin.trusted')}</option>
        </select>
        <select value={userSort} onChange={e => setUserSort(e.target.value as any)} className={selectClass(darkMode)}>
          <option value="joinDate">{t('admin.joinDate')}</option><option value="name">{t('admin.name')}</option><option value="wallet">{t('admin.wallet')}</option><option value="trust">{t('admin.trustPoints')}</option>
        </select>
      </div>

      {/* User List */}
      <div className="grid gap-3 max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
        {filteredUsers.map(u => (
          <div key={u.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border p-4 hover:shadow-md transition-all`}>
            <div className="flex items-start gap-3">
              <img src={u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`} alt="" className="w-11 h-11 rounded-xl shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{u.name}</span>
                  {u.isVerified && <Badge darkMode={darkMode} color="green">{t('admin.verified')}</Badge>}
                  {u.isAdmin && <Badge darkMode={darkMode} color="orange">{t('admin.admin')}</Badge>}
                  {u.isTrusted && <Badge darkMode={darkMode} color="purple">{t('admin.trustedLabel')}</Badge>}
                  {u.isDeactivated && <Badge darkMode={darkMode} color="red">{t('admin.deactivatedLabel')}</Badge>}
                </div>
                <p className={`text-[11px] mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{u.email}</p>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {u.phone && <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${darkMode ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-600'}`}><Info className="w-2.5 h-2.5" />{u.phone}</span>}
                  {u.dateOfBirth && (() => { const bd = new Date(u.dateOfBirth); const today = new Date(); let a = today.getFullYear() - bd.getFullYear(); const m = today.getMonth() - bd.getMonth(); if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) a--; return a > 0 ? <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${darkMode ? 'bg-purple-900/40 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>{t('admin.ageYears', { age: a })}</span> : null; })()}
                  {u.gender && u.gender !== 'male' && <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${darkMode ? 'bg-pink-900/40 text-pink-400' : 'bg-pink-50 text-pink-600'}`}>{t('admin.female')}</span>}
                </div>
                <div className={`flex items-center gap-4 mt-1.5 text-[11px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  <span className="flex items-center gap-1"><Wallet className="w-3 h-3" />{u.walletBalance} {t('common.egp')}</span>
                  <span className="flex items-center gap-1"><Star className="w-3 h-3" />{u.trustScore}</span>
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{u.joinDate ? formatTimeAgo(u.joinDate) : '-'}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 justify-end">
                <Btn darkMode={darkMode} size="xs" variant="outline" onClick={() => { setSelectedUser(u); loadUserDetail(u.id); setShowUserModal(true); }}><Eye className="w-3 h-3" /></Btn>
                <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => toggleVerify(u.id)}><UserCheck className="w-3 h-3" /></Btn>
                <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => toggleTrusted(u.id)}><Star className="w-3 h-3" /></Btn>
                <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => toggleAdmin(u.id)}><Shield className="w-3 h-3" /></Btn>
                <Btn darkMode={darkMode} size="xs" variant="ghost" onClick={() => toggleActive(u.id)}>{u.isDeactivated ? <Check className="w-3 h-3" /> : <Ban className="w-3 h-3" />}</Btn>
                <Btn darkMode={darkMode} size="xs" variant="danger" onClick={() => handleDeleteUser(u.id)}><Trash2 className="w-3 h-3" /></Btn>
              </div>
            </div>
          </div>
        ))}
        {filteredUsers.length === 0 && <EmptyState darkMode={darkMode} icon={<Users className="w-12 h-12" />} text={t('admin.noUsers')} />}
      </div>

      {/* User Detail Modal */}
      <Modal isOpen={showUserModal} onClose={() => setShowUserModal(false)} title={t('admin.userDetails')} darkMode={darkMode}>
        {selectedUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <img src={selectedUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedUser.id}`} alt="" className="w-14 h-14 rounded-xl" />
              <div>
                <p className={`font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{selectedUser.name}</p>
                <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{selectedUser.email}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {selectedUser.phone && <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${darkMode ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>📱 {selectedUser.phone}</span>}
                  {selectedUser.dateOfBirth && (() => { const bd = new Date(selectedUser.dateOfBirth); const today = new Date(); let a = today.getFullYear() - bd.getFullYear(); const m = today.getMonth() - bd.getMonth(); if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) a--; return a > 0 ? <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${darkMode ? 'bg-purple-900/40 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>🎂 {t('admin.ageYears', { age: a })}</span> : null; })()}
                  {selectedUser.gender && <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-50 text-gray-600'}`}>{selectedUser.gender === 'female' ? `♀ ${t('admin.female')}` : `♂ ${t('admin.male')}`}</span>}
                </div>
              </div>
            </div>
            {userDetail?.stats && (
              <div className="grid grid-cols-2 gap-3">
                <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-xl p-3`}><p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('admin.posts')}</p><p className={`font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{userDetail.stats.postsCount}</p></div>
                <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-xl p-3`}><p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('admin.comments')}</p><p className={`font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{userDetail.stats.commentsCount}</p></div>
                <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-xl p-3`}><p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('admin.friends')}</p><p className={`font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{userDetail.stats.friendsCount}</p></div>
                <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} rounded-xl p-3`}><p className={`text-[10px] ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t('admin.unreadNotifications')}</p><p className={`font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{userDetail.stats.unreadNotifications}</p></div>
              </div>
            )}
            {/* Wallet Adjustment */}
            <div className={`border rounded-xl p-4 space-y-3 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <h4 className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t('admin.adjustWallet')}</h4>
              <div className="flex gap-2">
                <input value={walletAmount} onChange={e => setWalletAmount(e.target.value)} type="number" placeholder={t('admin.amount')} className={`flex-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
                <input value={walletReason} onChange={e => setWalletReason(e.target.value)} placeholder={t('admin.reason')} className={`flex-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
                <Btn darkMode={darkMode} variant="primary" onClick={() => adjustWallet(selectedUser.id)}>{t('common.edit')}</Btn>
              </div>
            </div>
            {/* Send Warning */}
            <div className={`border rounded-xl p-4 space-y-3 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
              <h4 className={`text-xs font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t('admin.sendWarning')}</h4>
              <div className="flex gap-2">
                <input value={warningReason} onChange={e => setWarningReason(e.target.value)} placeholder={t('admin.warningReason')} className={`flex-1 px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-200'}`} />
                <Btn darkMode={darkMode} variant="danger" onClick={() => sendWarning(selectedUser.id)}>{t('admin.warn')}</Btn>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
