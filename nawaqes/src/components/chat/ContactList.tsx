import React from 'react';
import { Search, RefreshCw, Users, Plus } from 'lucide-react';
import { useChatContext } from './ChatContext';
import { ContactItem } from './ContactItem';
import { useTranslation } from 'react-i18next';

export const ContactList: React.FC = () => {
  const { filteredContacts, loadingContacts, searchQuery, setSearchQuery, loadContacts, apiContacts, setShowCreateGroup } = useChatContext();
  const ctx = useChatContext();
  const darkMode = (ctx as any).darkMode as boolean;
  const { t } = useTranslation();

  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  // Separate groups and DMs for visual grouping
  const groupContacts = filteredContacts.filter(c => c.isGroup);
  const dmContacts = filteredContacts.filter(c => !c.isGroup);

  return (
    <div className={`w-80 border-l flex flex-col ${
      darkMode ? 'border-gray-700' : 'border-gray-100'
    }`}>
      {/* Search bar */}
      <div className="p-3">
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl ${
          darkMode ? 'bg-gray-700' : 'bg-gray-100'
        }`}>
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder={t('messages.searchConversations')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className={`bg-transparent border-none outline-none text-sm w-full ${
              darkMode ? 'text-white placeholder:text-gray-500' : 'text-gray-900 placeholder:text-gray-400'
            }`}
          />
          {loadingContacts && <RefreshCw className="w-4 h-4 animate-spin text-orange-500 flex-shrink-0" />}
        </div>
      </div>

      {/* Create Group button */}
      <div className="px-3 pb-2">
        <button
          onClick={() => setShowCreateGroup(true)}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-colors ${
            darkMode
              ? 'bg-orange-900/20 text-orange-400 hover:bg-orange-900/30'
              : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
          }`}
        >
          <Users className="w-4 h-4" />
          {t('messages.createGroup')}
          <Plus className="w-3.5 h-3.5 ms-auto" />
        </button>
      </div>

      {/* Contacts list */}
      <div className="flex-1 overflow-y-auto">
        {loadingContacts && apiContacts.length === 0 ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-gray-400 mb-2" />
            <p className={`text-sm ${textMuted}`}>{t('messages.loading')}</p>
          </div>
        ) : filteredContacts.length > 0 ? (
          <>
            {/* Groups section */}
            {groupContacts.length > 0 && (
              <>
                <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${
                  darkMode ? 'text-gray-500' : 'text-gray-400'
                }`}>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3 h-3" />
                    {t('messages.createGroup')}
                  </div>
                </div>
                {groupContacts.map(contact => (
                  <ContactItem key={contact.id} contact={contact} />
                ))}
              </>
            )}

            {/* DM contacts */}
            {dmContacts.length > 0 && groupContacts.length > 0 && (
              <div className={`mx-3 my-1 border-t ${darkMode ? 'border-gray-700' : 'border-gray-100'}`} />
            )}
            {dmContacts.map(contact => (
              <ContactItem key={contact.id} contact={contact} />
            ))}
          </>
        ) : (
          <div className="p-8 text-center">
            <p className={`text-sm ${textMuted}`}>{t('messages.noConversations')}</p>
            <p className={`text-xs mt-1 ${textMuted}`}>{t('messages.noConversationsDesc')}</p>
          </div>
        )}
      </div>
    </div>
  );
};
