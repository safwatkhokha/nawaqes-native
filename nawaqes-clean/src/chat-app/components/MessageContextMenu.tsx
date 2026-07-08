// ─── Long-Press Context Menu for Chat Messages ────────────────────
// Shows a bottom-sheet style menu when long-pressing a message.
// Actions: Reply, React, Forward, Copy, Pin, Edit, Delete

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Reply, Smile, Forward, Copy, Pin, PinOff, Edit2, Trash2, X,
} from 'lucide-react';

export interface MessageContextAction {
  type: 'reply' | 'react' | 'forward' | 'copy' | 'pin' | 'unpin' | 'edit' | 'delete';
  label: string;
  icon: React.ReactNode;
  color?: string;
  danger?: boolean;
}

interface MessageContextMenuProps {
  message: any;
  isOpen: boolean;
  onClose: () => void;
  actions: MessageContextAction[];
  onAction: (action: MessageContextAction) => void;
  onReact: (emoji: string) => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏'];

export const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
  message, isOpen, onClose, actions, onAction, onReact,
}) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Reset emoji picker when menu closes
  useEffect(() => {
    if (!isOpen) setShowEmojiPicker(false);
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 400,
            }}
          />

          {/* Bottom sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: '#13203A',
              borderRadius: '20px 20px 0 0',
              padding: '8px 0 32px',
              zIndex: 401,
              maxWidth: '500px',
              margin: '0 auto',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
            }}
          >
            {/* Handle bar */}
            <div style={{
              width: 40, height: 4, background: '#334155',
              borderRadius: 2, margin: '8px auto 16px',
            }} />

            {/* Quick emoji row (always visible at top) */}
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 8,
              padding: '0 16px 16px', borderBottom: '1px solid #1E2D4A',
            }}>
              {QUICK_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReact(emoji);
                    onClose();
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.05)', border: 'none',
                    cursor: 'pointer', fontSize: '1.8rem', padding: '8px 12px',
                    borderRadius: 12, transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Message preview */}
            {message?.text && (
              <div style={{
                padding: '12px 20px', margin: '8px 0',
                background: 'rgba(255,255,255,0.03)',
                fontSize: '0.85rem', color: '#94A3B8',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {message.text.substring(0, 80)}{message.text.length > 80 ? '...' : ''}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {actions.map((action) => (
                <button
                  key={action.type}
                  onClick={() => {
                    onAction(action);
                    onClose();
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '14px 24px',
                    background: 'none', border: 'none',
                    color: action.danger ? '#EF4444' : (action.color || '#F1F5F9'),
                    cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600,
                    textAlign: 'right', width: '100%',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {action.icon}
                  <span style={{ flex: 1, textAlign: 'right' }}>{action.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ─── Hook: useLongPress ───────────────────────────────────────────
// Detects long-press on touch devices and right-click on desktop.
// Returns handlers to spread on the target element.

interface LongPressOptions {
  onLongPress: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  delay?: number; // ms
}

export function useLongPress({ onLongPress, onContextMenu, delay = 500 }: LongPressOptions) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggeredRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });

  const start = useCallback((e: React.TouchEvent) => {
    startPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    triggeredRef.current = false;
    timeoutRef.current = setTimeout(() => {
      triggeredRef.current = true;
      onLongPress();
      // Haptic feedback if available
      if (navigator.vibrate) navigator.vibrate(30);
    }, delay);
  }, [onLongPress, delay]);

  const move = useCallback((e: React.TouchEvent) => {
    // Cancel if moved too much (user is scrolling)
    const dx = Math.abs(e.touches[0].clientX - startPosRef.current.x);
    const dy = Math.abs(e.touches[0].clientY - startPosRef.current.y);
    if (dx > 10 || dy > 10) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, []);

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const onContextMenuHandler = useCallback((e: React.MouseEvent) => {
    if (onContextMenu) {
      e.preventDefault();
      onContextMenu(e);
    } else {
      // Default: trigger long-press handler on right-click
      e.preventDefault();
      onLongPress();
    }
  }, [onLongPress, onContextMenu]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return {
    onTouchStart: start,
    onTouchMove: move,
    onTouchEnd: clear,
    onTouchCancel: clear,
    onContextMenu: onContextMenuHandler,
  };
}
