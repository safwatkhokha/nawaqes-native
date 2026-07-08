import React from 'react';
import { ArrowRight, RefreshCw, UserPlus, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import {
  ChatProvider,
  ContactList,
  ChatWindow,
  CallOverlay,
  NewChatDialog,
  ImagePreview,
  ContextMenu,
  ReactionPicker,
  ForwardDialog,
  CreateGroupDialog,
} from './chat';
import { useChatContext } from './chat';

// ─── Inner layout component (needs ChatContext) ──────────────────────
const ChatLayout: React.FC = () => {
  const { selectedContact, loadContacts, loadingContacts, setShowNewChat, showNewChat, setShowCreateGroup } = useChatContext();
  const ctx = useChatContext();
  const darkMode = (ctx as any).darkMode as boolean;
  const dir = (ctx as any).dir as 'rtl' | 'ltr';
  const navigate = useNavigate();
  const { t } = useTranslation();

  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const bgCard = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';

  return (
    <div className="max-w-4xl mx-auto" dir={dir}>
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/')}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className={`text-2xl font-black ${textPrimary}`}>{t('messages.title')}</h1>
          <p className={`text-sm ${textMuted}`}>{t('messages.titleDesc')}</p>
        </div>
        <button
          onClick={loadContacts}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${loadingContacts ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={() => setShowCreateGroup(true)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            darkMode ? 'bg-orange-900/20 text-orange-400 hover:bg-orange-900/30' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
          }`}
        >
          <Users className="w-4 h-4" />
          {t('messages.createGroup')}
        </button>
        <button
          onClick={() => setShowNewChat(!showNewChat)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
          }`}
        >
          <UserPlus className="w-4 h-4" />
          {t('messages.newConversation')}
        </button>
      </div>

      {/* New Chat Dialog */}
      <NewChatDialog />
      <CreateGroupDialog />
      <ForwardDialog />

      {/* Chat Container */}
      <div
        className={`rounded-2xl border overflow-hidden flex ${bgCard}`}
        style={{ height: 'calc(100vh - 12rem)', minHeight: '400px' }}
      >
        {/* Contacts List - hidden on mobile when a contact is selected */}
        <div className={`${selectedContact ? 'hidden md:flex' : 'flex'}`}>
          <ContactList />
        </div>

        {/* Chat Area - hidden on mobile when no contact selected */}
        <div className={`flex-1 flex flex-col min-h-0 ${!selectedContact ? 'hidden md:flex' : 'flex'}`}>
          <ChatWindow />
        </div>
      </div>

      {/* Overlays */}
      <ContextMenu />
      <ReactionPicker floating />
      <CallOverlay />
      <ImagePreview />
    </div>
  );
};

// ─── Main page component (thin wrapper) ──────────────────────────────
export const MessagesPage: React.FC = () => {
  const { darkMode } = useAppContext();
  const { dir } = useLanguage();

  return (
    <ChatProvider>
      <ChatLayout />
    </ChatProvider>
  );
};
