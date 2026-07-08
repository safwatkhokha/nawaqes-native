// ─── Message List (scrollable message container) ────────────────────
// Renders date separators + message bubbles + typing indicator + scroll-to-bottom
// Uses messagesContainerRef from ChatProvider so the provider can control
// scrolling (scrollTop) without causing the whole page to jump.
import React, { useEffect } from 'react';
import { useChat } from './ChatProvider';
import { MessageBubble } from './MessageBubble';

export const MessageList: React.FC = () => {
  const {
    messages, loadingMessages, activeContact, darkMode, myId,
    messagesContainerRef, messagesEndRef,
  } = useChat();

  const textMuted = darkMode ? 'text-gray-400' : 'text-gray-500';

  // Group messages by date for separators
  const renderMessages = () => {
    const elements: React.ReactNode[] = [];
    let lastDate = '';

    messages.forEach((msg, idx) => {
      // Date separator
      const msgDate = new Date(msg.timestamp).toDateString();
      if (msgDate !== lastDate) {
        lastDate = msgDate;
        const d = new Date(msg.timestamp);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
        let label: string;
        if (diffDays === 0) label = 'اليوم';
        else if (diffDays === 1) label = 'أمس';
        else if (diffDays < 7) label = `${diffDays} أيام`;
        else label = d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });

        elements.push(
          <div key={`date-${idx}`} className="flex items-center justify-center my-3">
            <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${
              darkMode ? 'bg-gray-800 text-gray-400' : 'bg-white text-gray-500 shadow-sm'
            }`}>
              {label}
            </span>
          </div>
        );
      }

      // System message
      if (msg.messageType === 'system') {
        elements.push(
          <div key={msg.id} className="flex items-center justify-center my-2">
            <span className={`text-[11px] italic ${textMuted} px-3 py-1 rounded-full ${
              darkMode ? 'bg-gray-800/50' : 'bg-gray-100'
            }`}>
              {msg.text}
            </span>
          </div>
        );
        return;
      }

      // Skip soft-deleted messages
      if (msg.deletedFor && msg.deletedFor !== 'everyone') {
        const deletedForUsers = msg.deletedFor.split(',').map(id => id.trim());
        if (deletedForUsers.includes(myId)) return;
      }

      elements.push(<MessageBubble key={msg.id} msg={msg} />);
    });

    return elements;
  };

  return (
    <div
      ref={messagesContainerRef}
      className={`flex-1 overflow-y-auto px-3 py-4 min-h-0 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}
    >
      {loadingMessages ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 ${
            darkMode ? 'bg-gray-800' : 'bg-white shadow-sm'
          }`}>
            <span className="text-2xl">👋</span>
          </div>
          <p className={`text-sm font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            ابدأ المحادثة مع {activeContact?.name}
          </p>
          <p className={`text-xs mt-1 ${textMuted}`}>
            أرسل أول رسالة
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {renderMessages()}
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};
