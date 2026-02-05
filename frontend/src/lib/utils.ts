import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatConfidence(confidence: number | null): string {
  if (confidence === null) return '-';
  return `${Math.round(confidence * 100)}%`;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'detected':
      return 'text-warning-600 bg-warning-50';
    case 'reviewing':
      return 'text-primary-600 bg-primary-50';
    case 'corrected':
      return 'text-success-600 bg-success-50';
    case 'skipped':
      return 'text-gray-600 bg-gray-50';
    case 'completed':
      return 'text-success-600 bg-success-50';
    case 'processing':
      return 'text-primary-600 bg-primary-50';
    case 'failed':
      return 'text-danger-600 bg-danger-50';
    default:
      return 'text-gray-600 bg-gray-50';
  }
}

export function getIssueTypeLabel(type: string): string {
  switch (type) {
    case 'low_confidence':
      return '低信頼度';
    case 'garbled':
      return '文字化け';
    case 'missing':
      return '欠落の可能性';
    case 'manual':
      return '手動選択';
    default:
      return type;
  }
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}
