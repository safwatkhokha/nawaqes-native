// ─── Attachment Picker — bottom-sheet for chat attachments ────────
// Options: Camera, Gallery (image), File (any), Location, Contact
// Mirrors WhatsApp's "+" / clip attachment flow.

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera, Image as ImageIcon, FileText, MapPin, User, X,
} from 'lucide-react';

export type AttachmentKind = 'camera' | 'gallery' | 'file' | 'location' | 'contact';

interface AttachmentPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onPick: (kind: AttachmentKind) => void;
  // Visual palette — caller passes the same colors used in ChatApp
  colors?: {
    cardBg?: string;
    textColor?: string;
    mutedColor?: string;
    border?: string;
    accentColor?: string;
  };
}

const DEFAULT_COLORS = {
  cardBg: '#161B22',
  textColor: '#E6EDF3',
  mutedColor: '#7D8590',
  border: '#30363D',
  accentColor: '#00A884',
};

const ITEMS: Array<{
  kind: AttachmentKind;
  label: string;
  icon: React.ReactNode;
  color: string;
}> = [
  { kind: 'camera',  label: 'كاميرا',        icon: <Camera style={{ width: 24, height: 24 }} />,    color: '#FF6B6B' },
  { kind: 'gallery', label: 'صورة / معرض',   icon: <ImageIcon style={{ width: 24, height: 24 }} />, color: '#9C6BFF' },
  { kind: 'file',    label: 'ملف (PDF, DOC)', icon: <FileText style={{ width: 24, height: 24 }} />,  color: '#4DABF7' },
  { kind: 'location',label: 'الموقع',         icon: <MapPin style={{ width: 24, height: 24 }} />,    color: '#51CF66' },
  { kind: 'contact', label: 'جهة اتصال',      icon: <User style={{ width: 24, height: 24 }} />,      color: '#FCC419' },
];

export const AttachmentPicker: React.FC<AttachmentPickerProps> = ({
  isOpen, onClose, onPick, colors = {},
}) => {
  const c = { ...DEFAULT_COLORS, ...colors };
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 380 }}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: c.cardBg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
              padding: '8px 0 calc(16px + env(safe-area-inset-bottom))',
              zIndex: 381, maxWidth: 500, margin: '0 auto',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
              borderBottom: `1px solid ${c.border}`,
            }}
          >
            {/* Handle bar */}
            <div style={{
              width: 40, height: 4, background: c.border,
              borderRadius: 2, margin: '8px auto 16px',
            }} />

            <div style={{
              display: 'flex', justifyContent: 'space-around',
              padding: '8px 16px 16px', flexWrap: 'wrap', gap: 12,
            }}>
              {ITEMS.map(item => (
                <motion.button
                  key={item.kind}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => { onPick(item.kind); onClose(); }}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 8, padding: 8, minWidth: 72, color: c.textColor,
                  }}
                >
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: `${item.color}22`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    color: item.color,
                  }}>
                    {item.icon}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: c.mutedColor, fontWeight: 600 }}>
                    {item.label}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AttachmentPicker;
