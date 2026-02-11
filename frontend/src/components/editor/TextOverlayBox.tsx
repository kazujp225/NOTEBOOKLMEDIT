'use client';

import { useRef, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';
import type { TextOverlay } from '@/lib/store';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface TextOverlayBoxProps {
  overlay: TextOverlay;
  effectiveZoom: number;
  isSelected: boolean;
  isEditing: boolean;
  onSelect: (id: string) => void;
  onDoubleClick: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onBlur: () => void;
  onDelete: (id: string) => void;
  onResizeStart: (id: string, handle: ResizeHandle, e: React.MouseEvent) => void;
  onDragStart: (id: string, e: React.MouseEvent) => void;
}

export function TextOverlayBox({
  overlay,
  effectiveZoom,
  isSelected,
  isEditing,
  onSelect,
  onDoubleClick,
  onTextChange,
  onBlur,
  onDelete,
  onResizeStart,
  onDragStart,
}: TextOverlayBoxProps) {
  const editRef = useRef<HTMLDivElement>(null);

  // Focus and select all text when entering edit mode
  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editRef.current);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [isEditing]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing) {
      onSelect(overlay.id);
      if (e.button === 0) {
        onDragStart(overlay.id, e);
      }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick(overlay.id);
  };

  const handleBlur = () => {
    if (editRef.current) {
      onTextChange(overlay.id, editRef.current.innerText);
    }
    onBlur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isEditing) {
      e.stopPropagation();
      if (e.key === 'Escape') {
        handleBlur();
      }
    } else {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.stopPropagation();
        onDelete(overlay.id);
      }
    }
  };

  const scaledFontSize = overlay.fontSize * effectiveZoom;

  return (
    <div
      className={cn(
        'text-overlay-box',
        isSelected && 'text-overlay-box-selected',
        isEditing && 'text-overlay-box-editing'
      )}
      style={{
        left: overlay.bbox.x * effectiveZoom,
        top: overlay.bbox.y * effectiveZoom,
        width: overlay.bbox.width * effectiveZoom,
        height: overlay.bbox.height * effectiveZoom,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`テキスト: ${overlay.text.slice(0, 20)}`}
    >
      {/* Text content */}
      <div
        ref={editRef}
        className="w-full h-full overflow-hidden outline-none"
        style={{
          fontSize: `${scaledFontSize}px`,
          fontFamily: overlay.fontFamily,
          fontWeight: overlay.fontWeight,
          fontStyle: overlay.fontStyle,
          textDecoration: overlay.textDecoration === 'underline' ? 'underline' : 'none',
          textAlign: overlay.textAlign,
          color: overlay.color,
          backgroundColor: overlay.backgroundColor === 'transparent' ? undefined : overlay.backgroundColor,
          lineHeight: 1.2,
          padding: `${Math.max(2, 4 * effectiveZoom)}px`,
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          cursor: isEditing ? 'text' : 'move',
        }}
        contentEditable={isEditing}
        suppressContentEditableWarning
        onBlur={handleBlur}
      >
        {overlay.text}
      </div>

      {/* Selection handles */}
      {isSelected && !isEditing && (
        <>
          {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as ResizeHandle[]).map((handle) => (
            <div
              key={handle}
              className={`selection-handle selection-handle-${handle}`}
              style={{ borderColor: '#22c55e' }}
              onMouseDown={(e) => {
                e.stopPropagation();
                onResizeStart(overlay.id, handle, e);
              }}
            />
          ))}
        </>
      )}

      {/* Context toolbar */}
      {isSelected && !isEditing && (
        <div className="context-toolbar">
          <Tooltip content="削除">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(overlay.id);
              }}
              className="context-toolbar-btn context-toolbar-btn-danger"
              aria-label="削除"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
