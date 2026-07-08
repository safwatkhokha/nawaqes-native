// ─── Mute Duration Dialog — Do Not Disturb with time-based unmute ──
// Options: Always (toggle mute), 1 hour, 8 hours, 1 week, 48 hours.
// On select → calls onMute(minutes | null). null = indefinite mute.

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BellOff, Clock, CalendarClock, Infinity as InfinityIcon, X,
} from 'lucide-react';

interface MuteDurationDialogProps {
  isOpen: boolean;
  contactName: string;
  onClose: () => void;
  onMute: (minutes: number | null) => void;
  colors?: {
    cardBg?: string;
    textColor?: string;
    mutedColor?: string;
    border?: string;
    inputBg?: string;
    accentColor?: string;
  };
}

const DEFAULT_COLORS = {
  cardBg: '#161B22',
  textColor: '#E6EDF3',
  mutedColor: '#7D8590',
  border: '#30363D',
  inputBg: '#21262D',
  accentColor: '#00A884',
};

const OPTIONS: Array<{ minutes: number | null; label: string; hint: string; icon: React.ReactNode }> = [
  { minutes: 60,      label: 'ساعة واحدة',  hint: 'كتم حتى ينتهي خلال ساعة',         icon: <Clock style={{ width: 20, height: 20 }} /> },
  { minutes: 60 * 8,  label: '8 ساعات',     hint: 'حتى نهاية يوم العمل',           icon: <Clock style={{ width: 20, height: 20 }} /> },
  { minutes: 60 * 48, label: 'يومان',       hint: 'حتى نهاية عطلة نهاية الأسبوع',    icon: <CalendarClock style={{ width: 20, height: 20 }} /> },
  { minutes: 60 * 24 * 7, label: 'أسبوع',   hint: 'كتم لمدة 7 أيام',                icon: <CalendarClock style={{ width: 20, height: 20 }} /> },
  { minutes: null,    label: 'دائم',         hint: 'حتى الإلغاء اليدوي',             icon: <InfinityIcon style={{ width: 20, height: 20 }} /> },
];

export const MuteDurationDialog: React.FC<MuteDurationDialogProps> = ({
  isOpen, contactName, onClose, onMute, colors = {},
}) => {
  const c = { ...DEFAULT_COLORS, ...colors };
  const [selected, setSelected] = useState<number | null | undefined>(undefined);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 420, padding: 16,
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            style={{
              background: c.cardBg, borderRadius: 16, padding: 20,
              maxWidth: 380, width: '100%', border: `1px solid ${c.border}`,
              boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: `${c.accentColor}22`, color: c.accentColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <BellOff style={{ width: 20, height: 20 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: c.textColor, margin: 0 }}>
                  كتم الإشعارات
                </h3>
                <p style={{ fontSize: '0.78rem', color: c.mutedColor, margin: '2px 0 0' }}>
                  {contactName}
                </p>
              </div>
              <button onClick={onClose} style={{
                background: 'none', border: 'none', color: c.mutedColor,
                cursor: 'pointer', padding: 4,
              }}>
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {OPTIONS.map(opt => {
                const isSelected = selected === opt.minutes;
                return (
                  <button
                    key={String(opt.minutes)}
                    onClick={() => setSelected(opt.minutes)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                      background: isSelected ? `${c.accentColor}15` : c.inputBg,
                      border: `1px solid ${isSelected ? c.accentColor : 'transparent'}`,
                      borderRadius: 12, cursor: 'pointer', textAlign: 'right',
                      color: c.textColor, transition: 'background 0.15s, border 0.15s',
                    }}
                  >
                    <div style={{ color: isSelected ? c.accentColor : c.mutedColor }}>{opt.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{opt.label}</div>
                      <div style={{ fontSize: '0.72rem', color: c.mutedColor }}>{opt.hint}</div>
                    </div>
                    {isSelected && (
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%',
                        background: c.accentColor, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>✓</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1, padding: '11px', borderRadius: 10, border: 'none',
                  background: c.inputBg, color: c.mutedColor, fontWeight: 600,
                  fontSize: '0.85rem', cursor: 'pointer',
                }}
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  if (selected !== undefined) onMute(selected);
                }}
                disabled={selected === undefined}
                style={{
                  flex: 1, padding: '11px', borderRadius: 10, border: 'none',
                  background: selected === undefined ? `${c.accentColor}55` : c.accentColor,
                  color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                  opacity: selected === undefined ? 0.6 : 1,
                }}
              >
                كتم
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MuteDurationDialog;
