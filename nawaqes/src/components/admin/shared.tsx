import React from 'react';
import { ORANGE } from './helpers';

// ─── Stat Card Component ─────────────────────────────────────────────
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  trend?: string;
  color?: string;
  darkMode?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  icon, label, value, trend, color = ORANGE, darkMode = false,
}) => (
  <div
    className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl p-5 border hover:shadow-lg transition-all duration-300 group relative overflow-hidden`}
  >
    {/* Gradient accent */}
    <div
      className="absolute top-0 left-0 w-full h-1 rounded-t-2xl opacity-80"
      style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }}
    />
    <div className="flex items-start justify-between mb-3">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: color + '18' }}
      >
        <span style={{ color }}>{icon}</span>
      </div>
      {trend && (
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            trend.startsWith('+')
              ? darkMode ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-green-600'
              : darkMode ? 'bg-red-900/40 text-red-400' : 'bg-red-50 text-red-500'
          }`}
        >
          {trend}
        </span>
      )}
    </div>
    <p className={`text-2xl font-black mb-0.5 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
      {value}
    </p>
    <p className={`text-xs font-medium ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{label}</p>
  </div>
);

// ─── Section Card ────────────────────────────────────────────────────
interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  darkMode?: boolean;
}

export const Section: React.FC<SectionProps> = ({
  title, icon, children, action, darkMode = false,
}) => (
  <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'} rounded-2xl border overflow-hidden`}>
    <div className={`flex items-center justify-between px-5 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-50'}`}>
      <h3 className={`text-sm font-black flex items-center gap-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
        <span className="text-orange-500">{icon}</span>
        {title}
      </h3>
      {action}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

// ─── Badge ───────────────────────────────────────────────────────────
interface BadgeProps {
  children: React.ReactNode;
  color?: string;
  darkMode?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({ children, color = 'gray', darkMode = false }) => {
  const lightCls: Record<string, string> = {
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-500',
    orange: 'bg-orange-50 text-orange-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    gray: 'bg-gray-50 text-gray-500',
    pink: 'bg-pink-50 text-pink-600',
  };
  const darkCls: Record<string, string> = {
    green: 'bg-green-900/40 text-green-400',
    red: 'bg-red-900/40 text-red-400',
    orange: 'bg-orange-900/40 text-orange-400',
    blue: 'bg-blue-900/40 text-blue-400',
    purple: 'bg-purple-900/40 text-purple-400',
    yellow: 'bg-yellow-900/40 text-yellow-400',
    gray: 'bg-gray-700 text-gray-400',
    pink: 'bg-pink-900/40 text-pink-400',
  };
  const colorMap = darkMode ? darkCls : lightCls;
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colorMap[color] || colorMap.gray}`}>
      {children}
    </span>
  );
};

// ─── Button ──────────────────────────────────────────────────────────
interface BtnProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'ghost' | 'primary' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'xs';
  disabled?: boolean;
  className?: string;
  title?: string;
  darkMode?: boolean;
}

export const Btn: React.FC<BtnProps> = ({
  children, onClick, variant = 'ghost', size = 'sm', disabled, className = '', title, darkMode = false,
}) => {
  const base = 'inline-flex items-center justify-center gap-1.5 font-bold rounded-xl transition-all disabled:opacity-40 cursor-pointer ';
  const vars: Record<string, string> = darkMode
    ? {
        ghost: 'text-gray-400 hover:bg-gray-700 ',
        primary: 'bg-orange-500 text-white hover:bg-orange-600 shadow-sm ',
        danger: 'text-red-400 hover:bg-red-900/30 ',
        outline: 'border border-gray-600 text-gray-300 hover:bg-gray-700 ',
      }
    : {
        ghost: 'text-gray-500 hover:bg-gray-50 ',
        primary: 'bg-orange-500 text-white hover:bg-orange-600 shadow-sm ',
        danger: 'text-red-500 hover:bg-red-50 ',
        outline: 'border border-gray-200 text-gray-600 hover:bg-gray-50 ',
      };
  const sizes: Record<string, string> = {
    xs: 'px-2 py-1 text-[10px]',
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base}${vars[variant]}${sizes[size]}${className}`}
    >
      {children}
    </button>
  );
};

// ─── Empty State ─────────────────────────────────────────────────────
interface EmptyStateProps {
  icon: React.ReactNode;
  text: string;
  darkMode?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, text, darkMode = false }) => (
  <div className={`flex flex-col items-center justify-center py-12 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`}>
    <span className="w-12 h-12 mb-3 opacity-60">{icon}</span>
    <p className={`text-sm font-medium ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{text}</p>
  </div>
);

// ─── Modal ───────────────────────────────────────────────────────────
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  darkMode?: boolean;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen, onClose, title, children, darkMode = false, maxWidth = 'max-w-lg',
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-2xl w-full ${maxWidth} max-h-[85vh] overflow-y-auto shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`p-5 border-b flex items-center justify-between ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <h3 className={`font-black ${darkMode ? 'text-white' : 'text-gray-900'}`}>{title}</h3>
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              darkMode ? 'text-gray-500 hover:bg-gray-700' : 'text-gray-400 hover:bg-gray-100'
            }`}
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

// ─── Skeleton Loader ─────────────────────────────────────────────────
export const Skeleton: React.FC<{ className?: string; darkMode?: boolean }> = ({ className = '', darkMode = false }) => (
  <div className={`animate-pulse ${darkMode ? 'bg-gray-700' : 'bg-gray-200'} rounded-xl ${className}`} />
);

// ─── Loading Spinner ─────────────────────────────────────────────────
export const LoadingSpinner: React.FC<{ darkMode?: boolean; text?: string }> = ({ darkMode, text }) => (
  <div className="flex items-center justify-center py-12">
    <div className="text-center space-y-3">
      <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
      {text && <p className={`text-sm font-medium ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{text}</p>}
    </div>
  </div>
);
