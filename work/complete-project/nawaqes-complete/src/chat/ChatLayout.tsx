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

  return (
    <div
      className="chat-layout-root flex overflow-hidden"
      style={{
        background: darkMode ? '#000000' : '#FFFFFF',
        zIndex: 100,
      }}
      dir="rtl"
    >
      {/* Conversation list
          - Mobile/Tablet (< 1024px): full width, hidden when a chat is open
          - Desktop (≥ 1024px): fixed sidebar (400px), always visible */}
      <div
        className={`${showConversationList ? 'flex' : 'hidden'} lg:flex w-full lg:w-[400px] flex-shrink-0 h-full overflow-hidden`}
        style={{ background: darkMode ? '#000000' : '#FFFFFF' }}
      >
        <ConversationList />
      </div>

      {/* Chat area
          - Mobile/Tablet (< 1024px): full width, hidden when list is showing
          - Desktop (≥ 1024px): flex-1 (fills remaining space), always visible */}
      <div
        className={`${showConversationList ? 'hidden' : 'flex'} lg:flex flex-1 min-w-0 h-full overflow-hidden`}
        style={{ background: darkMode ? '#0A0A0A' : '#F5F5F5' }}
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
                نواقص — محادثات
              </p>
              <p className="text-sm mt-1" style={{ color: darkMode ? '#666666' : '#999999' }}>
                اختر محادثة لبدء المراسلة
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
