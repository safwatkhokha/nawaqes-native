import React, { useEffect, useState } from 'react';
import { Users, Shield, ShieldCheck, UserPlus, UserMinus, LogOut, Trash2, BellOff, Bell, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useChatContext } from './ChatContext';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';

export const GroupInfo: React.FC = () => {
  const {
    showGroupInfo, setShowGroupInfo, selectedContact, selectedContactId,
    leaveGroup, removeGroupMember, addGroupMember, toggleMuteChat,
    contacts, myId,
  } = useChatContext();
  const ctx = useChatContext();
  const darkMode = (ctx as any).darkMode as boolean;
  const dir = (ctx as any).dir as 'rtl' | 'ltr';
  const { t } = useTranslation();

  const [groupData, setGroupData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const groupId = selectedContact?.groupId;

  useEffect(() => {
    if (showGroupInfo && groupId) {
      setLoading(true);
      api.getGroupDetails(groupId).then(data => {
        setGroupData(data);
      }).catch(() => {
        setGroupData(null);
      }).finally(() => setLoading(false));
    }
  }, [showGroupInfo, groupId]);

  useEffect(() => {
    if (showAddMember && memberSearch.length >= 2) {
      const timer = setTimeout(async () => {
        try {
          const results = await api.searchUsers(memberSearch);
          if (Array.isArray(results)) {
            const existingMemberIds = new Set((groupData?.members || []).map((m: any) => m.user_id));
            setSearchResults((results as any[]).filter((u: any) => !existingMemberIds.has(u.id) && u.id !== myId));
          }
        } catch {}
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [showAddMember, memberSearch, groupData, myId]);

  if (!showGroupInfo || !selectedContact?.isGroup) return null;

  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const members = groupData?.members || [];
  const isAdmin = members.some((m: any) => m.user_id === myId && m.role === 'admin');
  const isCreator = groupData?.creator_id === myId;
  const isMuted = selectedContact.isMuted || false;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className={`overflow-hidden border-b ${
          darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-100 bg-gray-50'
        }`}
      >
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center gap-4 mb-4">
            {/* Group Avatar */}
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
              darkMode ? 'bg-gray-700' : 'bg-orange-100'
            }`}>
              {selectedContact.avatar && !selectedContact.avatar.includes('dicebear') ? (
                <img src={selectedContact.avatar} alt="" className="w-14 h-14 rounded-xl object-cover" />
              ) : (
                <Users className={`w-7 h-7 ${darkMode ? 'text-orange-400' : 'text-orange-500'}`} />
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <h4 className={`font-bold text-sm ${textPrimary}`}>{selectedContact.name}</h4>
              <p className={`text-[10px] ${textMuted}`}>
                {t('messages.memberCount', { count: members.length })}
              </p>
              {groupData?.description && (
                <p className={`text-[10px] ${textMuted} mt-0.5`}>{groupData.description}</p>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={() => setShowGroupInfo(false)}
              className={`p-1.5 rounded-lg ${
                darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {/* Mute/Unmute */}
            <button
              onClick={() => toggleMuteChat(groupId || '', true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                isMuted
                  ? (darkMode ? 'bg-red-900/20 text-red-400 hover:bg-red-900/30' : 'bg-red-50 text-red-600 hover:bg-red-100')
                  : (darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300')
              }`}
            >
              {isMuted ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
              {isMuted ? t('messages.unmuteChat') : t('messages.muteChat')}
            </button>

            {/* Add member (admin only) */}
            {isAdmin && (
              <button
                onClick={() => setShowAddMember(!showAddMember)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                  darkMode ? 'bg-orange-900/20 text-orange-400 hover:bg-orange-900/30' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                }`}
              >
                <UserPlus className="w-3 h-3" />
                {t('messages.addMembers')}
              </button>
            )}

            {/* Leave group */}
            <button
              onClick={() => { leaveGroup(groupId || ''); setShowGroupInfo(false); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              <LogOut className="w-3 h-3" />
              {t('messages.leaveGroup')}
            </button>

            {/* Delete group (creator only) */}
            {isCreator && (
              <button
                onClick={async () => {
                  if (groupId) {
                    try { await api.deleteGroup(groupId); } catch {}
                    setShowGroupInfo(false);
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${
                  darkMode ? 'bg-red-900/20 text-red-400 hover:bg-red-900/30' : 'bg-red-50 text-red-600 hover:bg-red-100'
                }`}
              >
                <Trash2 className="w-3 h-3" />
                {t('messages.deleteGroup')}
              </button>
            )}
          </div>

          {/* Add member section */}
          <AnimatePresence>
            {showAddMember && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mb-3"
              >
                <div className={`p-3 rounded-xl ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <input
                    type="text"
                    placeholder={t('messages.searchConversations')}
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border outline-none text-sm ${
                      darkMode
                        ? 'bg-gray-800 border-gray-600 text-white placeholder:text-gray-500'
                        : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400'
                    }`}
                    dir={dir}
                  />
                  {searchResults.length > 0 && (
                    <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                      {searchResults.map(user => (
                        <button
                          key={user.id}
                          onClick={() => {
                            if (groupId) {
                              addGroupMember(groupId, user.id);
                              api.getGroupDetails(groupId).then(setGroupData).catch(() => {});
                            }
                            setMemberSearch('');
                            setSearchResults([]);
                          }}
                          className={`w-full flex items-center gap-2 p-2 rounded-lg text-sm transition-colors ${
                            darkMode ? 'hover:bg-gray-600 text-gray-200' : 'hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <img src={user.avatar || ''} alt="" className="w-7 h-7 rounded-full object-cover" />
                          <span className="font-medium">{user.name}</span>
                          <UserPlus className="w-3.5 h-3.5 ms-auto text-orange-500" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Members list */}
          <div>
            <h5 className={`text-xs font-bold mb-2 ${textMuted}`}>
              {t('messages.groupMembers')} ({members.length})
            </h5>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {members.map((member: any) => {
                const isMemberAdmin = member.role === 'admin';
                const canRemove = isAdmin && member.user_id !== myId && !isMemberAdmin;
                return (
                  <div
                    key={member.id}
                    className={`flex items-center gap-3 p-2 rounded-xl ${
                      darkMode ? 'bg-gray-700/50' : 'bg-white/80'
                    }`}
                  >
                    <img
                      src={member.avatar || ''}
                      alt={member.name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-bold block ${textPrimary}`}>
                        {member.name}
                        {member.user_id === myId && ` (${t('common.you')})`}
                      </span>
                      <span className={`text-[9px] flex items-center gap-1 ${
                        isMemberAdmin ? 'text-orange-500' : textMuted
                      }`}>
                        {isMemberAdmin ? <ShieldCheck className="w-2.5 h-2.5" /> : <Shield className="w-2.5 h-2.5" />}
                        {isMemberAdmin ? t('messages.admin') : t('messages.member')}
                      </span>
                    </div>
                    {canRemove && (
                      <button
                        onClick={() => {
                          if (groupId) {
                            removeGroupMember(groupId, member.user_id);
                            api.getGroupDetails(groupId).then(setGroupData).catch(() => {});
                          }
                        }}
                        className={`p-1 rounded-full ${
                          darkMode ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-50 text-red-500'
                        }`}
                        title={t('messages.removeMember')}
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
