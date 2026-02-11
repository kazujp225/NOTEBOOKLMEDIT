'use client';

import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TextOverlay } from '@/lib/store';

interface TextOverlayToolbarProps {
  overlay: TextOverlay;
  onUpdate: (updates: Partial<TextOverlay>) => void;
  onDelete: () => void;
}

const FONT_OPTIONS = [
  { value: 'Noto Sans JP, sans-serif', label: 'Noto Sans JP' },
  { value: 'Hiragino Sans, sans-serif', label: 'ヒラギノ角ゴ' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'monospace', label: 'Monospace' },
];

const COLOR_PRESETS = [
  '#000000', '#ffffff', '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#8b5cf6', '#f97316',
];

export function TextOverlayToolbar({ overlay, onUpdate, onDelete }: TextOverlayToolbarProps) {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 bg-white/95 backdrop-blur rounded-xl px-3 py-2 shadow-xl border border-gray-200"
      style={{ bottom: 56 }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Font family */}
      <select
        value={overlay.fontFamily}
        onChange={(e) => onUpdate({ fontFamily: e.target.value })}
        className="text-xs bg-gray-50 border border-gray-200 rounded-md px-1.5 py-1 outline-none focus:border-blue-400 max-w-[110px]"
      >
        {FONT_OPTIONS.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      {/* Font size */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onUpdate({ fontSize: Math.max(8, overlay.fontSize - 2) })}
          className="w-6 h-6 flex items-center justify-center text-xs text-gray-600 hover:bg-gray-100 rounded"
        >
          -
        </button>
        <span className="text-xs font-medium text-gray-700 min-w-[28px] text-center">
          {overlay.fontSize}
        </span>
        <button
          onClick={() => onUpdate({ fontSize: Math.min(200, overlay.fontSize + 2) })}
          className="w-6 h-6 flex items-center justify-center text-xs text-gray-600 hover:bg-gray-100 rounded"
        >
          +
        </button>
      </div>

      <div className="w-px h-5 bg-gray-300" />

      {/* Bold / Italic / Underline */}
      <ToggleButton
        active={overlay.fontWeight === 'bold'}
        onClick={() => onUpdate({ fontWeight: overlay.fontWeight === 'bold' ? 'normal' : 'bold' })}
        label="太字"
      >
        <Bold className="w-3.5 h-3.5" />
      </ToggleButton>
      <ToggleButton
        active={overlay.fontStyle === 'italic'}
        onClick={() => onUpdate({ fontStyle: overlay.fontStyle === 'italic' ? 'normal' : 'italic' })}
        label="斜体"
      >
        <Italic className="w-3.5 h-3.5" />
      </ToggleButton>
      <ToggleButton
        active={overlay.textDecoration === 'underline'}
        onClick={() => onUpdate({ textDecoration: overlay.textDecoration === 'underline' ? 'none' : 'underline' })}
        label="下線"
      >
        <Underline className="w-3.5 h-3.5" />
      </ToggleButton>

      <div className="w-px h-5 bg-gray-300" />

      {/* Text align */}
      <ToggleButton
        active={overlay.textAlign === 'left'}
        onClick={() => onUpdate({ textAlign: 'left' })}
        label="左揃え"
      >
        <AlignLeft className="w-3.5 h-3.5" />
      </ToggleButton>
      <ToggleButton
        active={overlay.textAlign === 'center'}
        onClick={() => onUpdate({ textAlign: 'center' })}
        label="中央揃え"
      >
        <AlignCenter className="w-3.5 h-3.5" />
      </ToggleButton>
      <ToggleButton
        active={overlay.textAlign === 'right'}
        onClick={() => onUpdate({ textAlign: 'right' })}
        label="右揃え"
      >
        <AlignRight className="w-3.5 h-3.5" />
      </ToggleButton>

      <div className="w-px h-5 bg-gray-300" />

      {/* Text color */}
      <div className="relative group">
        <div
          className="w-6 h-6 rounded border border-gray-300 cursor-pointer"
          style={{ backgroundColor: overlay.color }}
          title="文字色"
        />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-wrap gap-1 bg-white rounded-lg border border-gray-200 p-2 shadow-lg w-[140px]">
          {COLOR_PRESETS.map((c) => (
            <button
              key={`text-${c}`}
              className={cn(
                'w-6 h-6 rounded border cursor-pointer',
                c === overlay.color ? 'border-blue-500 ring-1 ring-blue-300' : 'border-gray-200'
              )}
              style={{ backgroundColor: c }}
              onClick={() => onUpdate({ color: c })}
            />
          ))}
          <input
            type="color"
            value={overlay.color}
            onChange={(e) => onUpdate({ color: e.target.value })}
            className="w-full h-6 mt-1 cursor-pointer"
          />
        </div>
      </div>

      {/* Background color */}
      <div className="relative group">
        <div
          className="w-6 h-6 rounded border border-gray-300 cursor-pointer"
          style={{
            backgroundColor: overlay.backgroundColor === 'transparent' ? '#ffffff' : overlay.backgroundColor,
            backgroundImage: overlay.backgroundColor === 'transparent'
              ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)'
              : undefined,
            backgroundSize: '6px 6px',
            backgroundPosition: '0 0, 3px 3px',
          }}
          title="背景色"
        />
        <div className="absolute bottom-full right-0 mb-2 hidden group-hover:flex flex-wrap gap-1 bg-white rounded-lg border border-gray-200 p-2 shadow-lg w-[140px]">
          <button
            className={cn(
              'w-6 h-6 rounded border cursor-pointer text-xs',
              overlay.backgroundColor === 'transparent' ? 'border-blue-500 ring-1 ring-blue-300' : 'border-gray-200'
            )}
            style={{
              backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)',
              backgroundSize: '6px 6px',
              backgroundPosition: '0 0, 3px 3px',
            }}
            onClick={() => onUpdate({ backgroundColor: 'transparent' })}
            title="透明"
          />
          {COLOR_PRESETS.map((c) => (
            <button
              key={`bg-${c}`}
              className={cn(
                'w-6 h-6 rounded border cursor-pointer',
                c === overlay.backgroundColor ? 'border-blue-500 ring-1 ring-blue-300' : 'border-gray-200'
              )}
              style={{ backgroundColor: c }}
              onClick={() => onUpdate({ backgroundColor: c })}
            />
          ))}
          <input
            type="color"
            value={overlay.backgroundColor === 'transparent' ? '#ffffff' : overlay.backgroundColor}
            onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
            className="w-full h-6 mt-1 cursor-pointer"
          />
        </div>
      </div>

      <div className="w-px h-5 bg-gray-300" />

      {/* Delete */}
      <button
        onClick={onDelete}
        className="w-7 h-7 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-md transition-colors"
        title="削除"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-7 h-7 flex items-center justify-center rounded-md transition-colors',
        active ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
      )}
      title={label}
    >
      {children}
    </button>
  );
}
