// ─── File Message Bubble — renders a file attachment in chat ──────
// Shows: file-type icon (color by MIME), filename, size, download button.
// Tap on the bubble opens the URL in a new tab; download button saves it.

import React from 'react';
import { FileText, Image as ImageIcon, FileAudio, FileVideo, FileArchive, FileSpreadsheet, Download, File as FileIcon } from 'lucide-react';

export interface FileMessageInfo {
  url: string;
  filename: string;
  size?: number;     // bytes
  mimeType?: string;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

// Pick icon + accent color by MIME type
function pickIcon(mimeType?: string, filename?: string): { icon: React.ReactNode; color: string } {
  const mt = (mimeType || '').toLowerCase();
  const ext = (filename || '').split('.').pop()?.toLowerCase() || '';
  if (mt.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
    return { icon: <ImageIcon style={{ width: 28, height: 28 }} />, color: '#9C6BFF' };
  }
  if (mt.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) {
    return { icon: <FileAudio style={{ width: 28, height: 28 }} />, color: '#FCC419' };
  }
  if (mt.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
    return { icon: <FileVideo style={{ width: 28, height: 28 }} />, color: '#FF6B6B' };
  }
  if (mt.includes('zip') || mt.includes('rar') || mt.includes('7z') || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return { icon: <FileArchive style={{ width: 28, height: 28 }} />, color: '#F59E0B' };
  }
  if (mt.includes('sheet') || mt.includes('excel') || ['xlsx', 'xls', 'csv'].includes(ext)) {
    return { icon: <FileSpreadsheet style={{ width: 28, height: 28 }} />, color: '#22C55E' };
  }
  if (mt.includes('pdf') || ext === 'pdf') {
    return { icon: <FileText style={{ width: 28, height: 28 }} />, color: '#EF4444' };
  }
  if (mt.includes('word') || mt.includes('document') || ['doc', 'docx', 'txt', 'rtf', 'md'].includes(ext)) {
    return { icon: <FileText style={{ width: 28, height: 28 }} />, color: '#4DABF7' };
  }
  return { icon: <FileIcon style={{ width: 28, height: 28 }} />, color: '#94A3B8' };
}

interface FileMessageBubbleProps {
  file: FileMessageInfo;
  mine: boolean;
  colors: {
    accentColor: string;
    textColor: string;
    mutedColor: string;
    cardBg: string;
  };
}

export const FileMessageBubble: React.FC<FileMessageBubbleProps> = ({ file, mine, colors }) => {
  const { icon, color } = pickIcon(file.mimeType, file.filename);
  const sizeLabel = formatFileSize(file.size);

  const open = () => {
    try { window.open(file.url, '_blank', 'noopener,noreferrer'); } catch {}
  };

  return (
    <div
      onClick={open}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
        background: mine ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.05)',
        borderRadius: 10, cursor: 'pointer', minWidth: 220, maxWidth: '100%',
        boxSizing: 'border-box',
        border: `1px solid ${mine ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)'}`,
      }}
      title="اضغط لفتح الملف"
    >
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: mine ? 'rgba(255,255,255,0.16)' : `${color}1A`,
        color: mine ? '#fff' : color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.85rem', fontWeight: 700,
          color: mine ? '#fff' : colors.textColor,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {file.filename}
        </div>
        {sizeLabel && (
          <div style={{
            fontSize: '0.72rem', color: mine ? 'rgba(255,255,255,0.78)' : colors.mutedColor,
            marginTop: 2,
          }}>
            {sizeLabel}
          </div>
        )}
      </div>
      <a
        href={file.url}
        download={file.filename}
        onClick={e => e.stopPropagation()}
        style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: mine ? 'rgba(255,255,255,0.18)' : `${colors.accentColor}1A`,
          color: mine ? '#fff' : colors.accentColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          textDecoration: 'none', border: 'none',
        }}
        title="تنزيل"
      >
        <Download style={{ width: 16, height: 16 }} />
      </a>
    </div>
  );
};

export default FileMessageBubble;
