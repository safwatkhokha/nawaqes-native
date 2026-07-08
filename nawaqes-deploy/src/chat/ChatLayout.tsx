// ─── Chat Layout (Messenger-style responsive) ───────────────────────
// Two-pane layout:
//   - Desktop (lg+ = 1024px+): sidebar (conversation list) + main chat area side by side
//   - Mobile/Tablet (< 1024px): single pane — shows list OR chat, toggled by selectConversation
//
// The layout is wrapped in ChatProvider so all child components can access
// the shared chat state via useChat().
import React from 'react';
import { ChatProvider, useChat } from './ChatProvider';
import { ConversationList } from './ConversationList';
import { ChatArea } from './ChatArea';
import { useAppContext } from '../contexts/AppContext';

const ChatLayoutInner: React.FC = () => {
  const { darkMode } = useAppContext();
  const { showConversationList, activeConversationId } = useChat();

  // Use inline styles ONLY — no Tailwind classes — to avoid any CSS
  // specificity issues or RTL flexbox quirks on mobile WebViews.
  // The root div is position:fixed with inset:0 to cover the full screen.
  // Inner panels use explicit width percentages to guarantee full-width
  // on mobile regardless of dir attribute or flex behavior.
  return (
    <div
      className="chat-layout-root"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        overflow: 'hidden',
        background: darkMode ? '#000000' : '#FFFFFF',
        zIndex: 100,
        boxSizing: 'border-box',
      }}
      dir="rtl"
    >
      {/* Conversation list — sidebar
          Mobile: 100% width when visible, 0 when hidden
          Desktop: 400px fixed sidebar, always visible */}
      <div
        style={{
          width: showConversationList ? '100%' : '0',
          maxWidth: showConversationList ? '100%' : '0',
          height: '100%',
          overflow: 'hidden',
          flexShrink: 0,
          background: darkMode ? '#000000' : '#FFFFFF',
          display: showConversationList ? 'flex' : 'none',
          boxSizing: 'border-box',
        }}
        className="lg:!flex lg:!w-[400px] lg:!max-w-[400px]"
      >
        <ConversationList />
      </div>

      {/* Chat area
          Mobile: 100% width when visible, 0 when hidden
          Desktop: flex-1 (fills remaining space), always visible */}
      <div
        style={{
          flex: showConversationList ? '0 0 0' : '1 1 100%',
          width: showConversationList ? '0' : '100%',
          maxWidth: showConversationList ? '0' : '100%',
          height: '100%',
          overflow: 'hidden',
          background: darkMode ? '#0A0A0A' : '#F5F5F5',
          display: showConversationList ? 'none' : 'flex',
          minWidth: 0,
          boxSizing: 'border-box',
        }}
        className="lg:!flex lg:!flex-1 lg:!w-auto"
      >
        {activeConversationId ? (
          <ChatArea />
        ) : (
          // Empty state — desktop only (mobile always shows the list)
          <div className="hidden lg:flex flex-1 items-center justify-center">
            <div className="text-center">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: darkMode ? '#1A1A1A' : '#E5E5E5' }}
              >
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: darkMode ? '#444444' : '#AAAAAA' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-lg font-bold" style={{ color: darkMode ? '#CCCCCC' : '#333333' }}>
                تواصل مع أصدقائك
              </p>
              <p className="text-sm mt-1" style={{ color: darkMode ? '#666666' : '#999999' }}>
                اختر صديقاً لبدء المراسلة
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const ChatLayout: React.FC = () => {
  return (
    <ChatProvider>
      <ChatLayoutInner />
    </ChatProvider>
  );
};
