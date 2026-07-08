import React, { useState } from 'react';
import { Users, X, Search, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useChatContext } from './ChatContext';
import { useTranslation } from 'react-i18next';

export const CreateGroupDialog: React.FC = () => {
  const {
    showCreateGroup, setShowCreateGroup, contacts, createGroup, myId,
  } = useChatContext();
  const ctx = useChatContext();
  const darkMode = (ctx as any).darkMode as boolean;
  const dir = (ctx as any).dir as 'rtl' | 'ltr';
  const { t } = useTranslation();

  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  if (!showCreateGroup) return null;

  const availableContacts = contacts.filter(c =>
    !c.isGroup && c.id !== myId && (c.name.includes(searchFilter))
  );

  const toggleMember = (userId: string) => {
    setSelectedMembers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selectedMembers.size === 0 || creating) return;
    setCreating(true);
    try {
      await createGroup(groupName.trim(), '', groupDescription.trim(), Array.from(selectedMembers));
      setGroupName('');
      setGroupDescription('');
      setSelectedMembers(new Set());
    } finally {
      setCreating(false);
    }
  };

  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
        onClick={() => setShowCreateGroup(false)}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className={`w-full max-w-md mx-4 rounded-2xl shadow-2xl border overflow-hidden ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={`flex items-center justify-between px-4 py-3 border-b ${
            darkMode ? 'border-gray-700' : 'border-gray-100'
          }`}>
            <div className="flex items-center gap-2">
              <Users className={`w-5 h-5 ${darkMode ? 'text-orange-400' : 'text-orange-500'}`} />
              <h3 className={`font-bold text-sm ${textPrimary}`}>
                {t('messages.createGroup')}
              </h3>
            </div>
            <button
              onClick={() => setShowCreateGroup(false)}
              className={`p-1.5 rounded-full transition-colors ${
                darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form */}
          <div className="p-4 space-y-3">
            {/* Group name */}
            <div>
              <label className={`text-xs font-bold block mb-1 ${textMuted}`}>
                {t('messages.groupName')}
              </label>
              <input
                type="text"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder={t('messages.groupName')}
                className={`w-full px-3 py-2.5 rounded-xl border outline-none text-sm transition-colors ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-orange-500'
                    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-orange-400'
                }`}
                dir={dir}
              />
            </div>

            {/* Description */}
            <div>
              <label className={`text-xs font-bold block mb-1 ${textMuted}`}>
                {t('messages.groupDescription')}
              </label>
              <input
                type="text"
                value={groupDescription}
                onChange={e => setGroupDescription(e.target.value)}
                placeholder={t('messages.groupDescription')}
                className={`w-full px-3 py-2.5 rounded-xl border outline-none text-sm transition-colors ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder:text-gray-500 focus:border-orange-500'
                    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-orange-400'
                }`}
                dir={dir}
              />
            </div>

            {/* Selected count */}
            {selectedMembers.size > 0 && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold ${
                darkMode ? 'bg-orange-900/20 text-orange-400' : 'bg-orange-50 text-orange-600'
              }`}>
                <Users className="w-3.5 h-3.5" />
                {t('messages.memberCount', { count: selectedMembers.size + 1 })}
              </div>
            )}

            {/* Search members */}
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl ${
              darkMode ? 'bg-gray-700' : 'bg-gray-100'
            }`}>
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                type="text"
                placeholder={t('messages.searchConversations')}
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                className={`bg-transparent border-none outline-none text-sm w-full ${
                  darkMode ? 'text-white placeholder:text-gray-500' : 'text-gray-900 placeholder:text-gray-400'
                }`}
                dir={dir}
              />
            </div>

            {/* Member list */}
            <div className="max-h-48 overflow-y-auto space-y-1">
              {availableContacts.map(contact => {
                const isSelected = selectedMembers.has(contact.id);
                return (
                  <button
                    key={contact.id}
                    onClick={() => toggleMember(contact.id)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors ${
                      isSelected
                        ? (darkMode ? 'bg-orange-900/20' : 'bg-orange-50')
                        : (darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50')
                    }`}
                  >
                    <img
                      src={contact.avatar}
                      alt={contact.name}
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                    />
                    <span className={`text-sm font-medium flex-1 text-start ${textPrimary}`}>
                      {contact.name}
                    </span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-orange-500 border-orange-500'
                        : (darkMode ? 'border-gray-600' : 'border-gray-300')
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                );
              })}
              {availableContacts.length === 0 && (
                <p className={`text-sm text-center py-4 ${textMuted}`}>
                  {t('messages.noConversations')}
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className={`px-4 py-3 border-t flex items-center justify-end gap-2 ${
            darkMode ? 'border-gray-700' : 'border-gray-100'
          }`}>
            <button
              onClick={() => setShowCreateGroup(false)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
              }`}
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleCreate}
              disabled={!groupName.trim() || selectedMembers.size === 0 || creating}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                groupName.trim() && selectedMembers.size > 0 && !creating
                  ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-sm shadow-orange-500/30'
                  : (darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-100 text-gray-400')
              }`}
            >
              {creating ? t('common.loading') : t('messages.createGroup')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
