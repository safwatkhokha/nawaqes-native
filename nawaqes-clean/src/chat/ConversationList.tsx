// ─── Conversation List (Messenger-style — rebuilt from reference image) ──
// Layout from top to bottom:
//   1. Header: Facebook icon + "messenger" title + edit (new chat) button
//   2. Search bar: rounded, dark gray, with Meta AI icon
//   3. Active stories row: horizontal scroll of online contacts (circles)
//   4. Conversation list: avatar + name + last message + time + unread
//   5. Bottom navigation: 3 icons (Menu / Stories / Chats)
//   6. Meta AI floating button (bottom-left, purple)
//
// All on a pure black background (#000000) in dark mode, white in light.
import React, { useState } from 'react';
import { useChat } from './ChatProvider';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Search, Edit, MoreHorizontal, Plus, MessageCircle, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const formatLastTime = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'الآن';
  if (diffMins < 60) return `${diffMins} د`;
  if (diffHours < 24) return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'أمس';
  if (diffDays < 7) return `${diffDays} أيام`;
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
};

// ─── Messenger-style bottom navigation ──────────────────────────────
// Navigation actions:
//   - chats: stays on conversation list (default)
//   - stories: navigates to / (home page where stories live)
//   - menu: navigates to /settings
const BottomNav: React.FC<{ active: 'chats' | 'stories' | 'menu'; onNavigate: (tab: 'chats' | 'stories' | 'menu') => void; darkMode: boolean }> = ({ active, onNavigate, darkMode }) => {
  const items: Array<{ id: 'menu' | 'stories' | 'chats'; icon: any; label: string; badge: number; route?: string }> = [
    { id: 'menu', icon: MoreHorizontal, label: 'القائمة', badge: 0, route: '/settings' },
    { id: 'stories', icon: Users, label: 'القصص', badge: 0, route: '/' },
    { id: 'chats', icon: MessageCircle, label: 'المحادثات', badge: 0 },
  ];
  return (
    <div
      className="flex items-center justify-around px-2 py-2 flex-shrink-0"
      style={{
        background: darkMode ? '#000000' : '#ffffff',
        borderTop: `1px solid ${darkMode ? '#1a1a1a' : '#e5e7eb'}`,
      }}
    >
      {items.map(item => {
        const isActive = active === item.id;
        const color = isActive
          ? (darkMode ? '#0099FF' : '#0066CC')
          : (darkMode ? '#666666' : '#999999');
        return (
          <button
            key={item.id}
            onClick={() => {
              onNavigate(item.id);
              // Navigate to route if specified (stories → home, menu → settings)
              if (item.route) {
                window.location.hash = item.route;
              }
            }}
            className="flex flex-col items-center gap-1 py-1 px-4 relative transition-opacity"
            style={{ opacity: isActive ? 1 : 0.7 }}
          >
            <item.icon className="w-6 h-6" style={{ color }} />
            <span className="text-[10px] font-medium" style={{ color }}>
              {item.label}
            </span>
            {item.badge > 0 && (
              <span
                className="absolute top-0 right-2 min-w-[16px] h-4 px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
                style={{ background: '#FF3B30' }}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export const ConversationList: React.FC = () => {
  const {
    conversations, activeConversationId, selectConversation,
    loadingConversations, searchQuery, setSearchQuery,
    refreshConversations, darkMode, myId,
  } = useChat();
  const { currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'chats' | 'stories' | 'menu'>('chats');
  const [showMenu, setShowMenu] = useState(false);

  // Filter online conversations for the "active now" stories row
  const onlineContacts = conversations.filter(c => c.online && !c.isGroup).slice(0, 10);

  const filtered = conversations.filter(c => {
    if (!searchQuery) return true;
    return c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           c.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // ─── Theme ───────────────────────────────────────────────────────
  // Messenger uses pure black in dark mode, pure white in light mode
  const bg = darkMode ? '#000000' : '#FFFFFF';
  const textPrimary = darkMode ? '#FFFFFF' : '#000000';
  const textMuted = darkMode ? '#888888' : '#666666';
  const searchBg = darkMode ? '#1A1A1A' : '#F0F0F0';
  const itemHoverBg = darkMode ? '#0A0A0A' : '#F5F5F5';
  const border = darkMode ? '#1A1A1A' : '#E5E7EB';

  return (
    <div className="flex flex-col h-full relative" style={{ background: bg }}>
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ background: bg }}>
        <div className="flex items-center gap-3">
          {/* Facebook-style "f" icon */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-lg"
            style={{ background: darkMode ? '#1A1A1A' : '#1877F2' }}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: textPrimary }}>
            messenger
          </h1>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('nawaqes-new-chat'))}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
          style={{ color: textPrimary }}
        >
          <Edit className="w-5 h-5" />
        </button>
      </div>

      {/* ─── Search bar ─── */}
      <div className="px-4 pb-3 flex-shrink-0" style={{ background: bg }}>
        <div
          className="flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5"
          style={{ background: searchBg }}
        >
          {/* Meta AI-style icon */}
          <div className="w-5 h-5 rounded-full flex-shrink-0" style={{
            background: 'linear-gradient(135deg, #9933FF 0%, #0066FF 100%)',
          }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ابحث في Meta AI"
            className="flex-1 bg-transparent border-none outline-none text-sm"
            style={{ color: textPrimary }}
          />
        </div>
      </div>

      {/* ─── Active stories row (horizontal scroll) ─── */}
      {!searchQuery && onlineContacts.length > 0 && (
        <div className="flex-shrink-0 pb-2" style={{ background: bg }}>
          <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide">
            {/* Add new chat circle */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('nawaqes-new-chat'))}
              className="flex flex-col items-center gap-1 flex-shrink-0"
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center border-2"
                style={{ borderColor: border, background: darkMode ? '#1A1A1A' : '#F0F0F0' }}
              >
                <Plus className="w-6 h-6" style={{ color: textPrimary }} />
              </div>
              <span className="text-[10px] font-medium" style={{ color: textMuted }}>
                محادثة جديدة
              </span>
            </button>
            {/* Online contacts */}
            {onlineContacts.map(contact => (
              <button
                key={contact.id}
                onClick={() => selectConversation(contact.id)}
                className="flex flex-col items-center gap-1 flex-shrink-0"
              >
                <div className="relative">
                  {/* Blue ring for active */}
                  <div
                    className="w-14 h-14 rounded-full p-0.5"
                    style={{ background: 'linear-gradient(135deg, #0099FF, #9933FF)' }}
                  >
                    <img
                      src={contact.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${contact.id}`}
                      alt=""
                      className="w-full h-full rounded-full object-cover border-2"
                      style={{ borderColor: bg }}
                    />
                  </div>
                  {/* Online green dot */}
                  <div
                    className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2"
                    style={{ background: '#00BA88', borderColor: bg }}
                  />
                </div>
                <span
                  className="text-[10px] font-medium max-w-[60px] truncate"
                  style={{ color: textPrimary }}
                >
                  {contact.name?.split(' ')[0] || '?'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Conversation list ─── */}
      <div className="flex-1 overflow-y-auto" style={{ background: bg }}>
        {loadingConversations ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: '#0099FF', borderTopColor: 'transparent' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 px-4">
            <p className="text-sm font-bold" style={{ color: textPrimary }}>
              {searchQuery ? 'لا توجد نتائج' : 'لا توجد محادثات'}
            </p>
            <p className="text-xs mt-1" style={{ color: textMuted }}>
              {searchQuery ? 'جرّب كلمة أخرى' : 'ابدأ محادثة جديدة'}
            </p>
          </div>
        ) : (
          filtered.map(conv => {
            const isActive = conv.id === activeConversationId;
            return (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-start"
                style={{
                  background: isActive ? (darkMode ? '#0A0A0A' : '#F0F7FF') : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = itemHoverBg;
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  {conv.avatar ? (
                    <img src={conv.avatar} alt={conv.name} className="w-14 h-14 rounded-full object-cover" />
                  ) : (
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg"
                      style={{ background: conv.isGroup ? 'linear-gradient(135deg, #FF6B35, #F7931E)' : 'linear-gradient(135deg, #0099FF, #0066CC)' }}
                    >
                      {conv.name?.charAt(0) || '?'}
                    </div>
                  )}
                  {conv.online && !conv.isGroup && (
                    <div
                      className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2"
                      style={{ background: '#00BA88', borderColor: bg }}
                    />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 text-start">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm truncate ${conv.unread ? 'font-bold' : 'font-medium'}`}
                      style={{ color: textPrimary }}
                    >
                      {conv.name}
                    </span>
                    <span
                      className="text-[11px] flex-shrink-0"
                      style={{ color: conv.unread ? '#0099FF' : textMuted }}
                    >
                      {formatLastTime(conv.lastTime)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p
                      className="text-xs truncate"
                      style={{ color: conv.unread ? textPrimary : textMuted, fontWeight: conv.unread ? 500 : 400 }}
                    >
                      {conv.lastMessage || 'لا توجد رسائل'}
                    </p>
                    {conv.unread > 0 && (
                      <span
                        className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
                        style={{ background: '#00BA88' }}
                      >
                        {conv.unread > 99 ? '99+' : conv.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* ─── Bottom navigation ─── */}
      <BottomNav active={activeTab} onNavigate={setActiveTab} darkMode={darkMode} />

      {/* ─── Meta AI floating button ─── */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('nawaqes-open-ai'))}
        className="absolute bottom-20 left-4 w-12 h-12 rounded-full flex items-center justify-center shadow-lg z-10 transition-transform active:scale-90"
        style={{
          background: darkMode ? '#1A1A1A' : '#FFFFFF',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}
        title="المساعد الذكي"
      >
        <div className="w-7 h-7 rounded-full" style={{
          background: 'linear-gradient(135deg, #9933FF 0%, #0066FF 100%)',
        }} />
      </button>
    </div>
  );
};
