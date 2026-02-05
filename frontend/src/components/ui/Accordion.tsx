'use client';

import { useState, createContext, useContext } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AccordionContextValue {
  expandedItems: Set<string>;
  toggleItem: (value: string) => void;
  type: 'single' | 'multiple';
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

interface AccordionProps {
  type?: 'single' | 'multiple';
  defaultExpanded?: string[];
  children: React.ReactNode;
  className?: string;
}

export function Accordion({
  type = 'single',
  defaultExpanded = [],
  children,
  className,
}: AccordionProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(
    new Set(defaultExpanded)
  );

  const toggleItem = (value: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        if (type === 'single') {
          next.clear();
        }
        next.add(value);
      }
      return next;
    });
  };

  return (
    <AccordionContext.Provider value={{ expandedItems, toggleItem, type }}>
      <div className={cn('divide-y divide-gray-100', className)}>{children}</div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function AccordionItem({ value, children, className }: AccordionItemProps) {
  const context = useContext(AccordionContext);
  if (!context) throw new Error('AccordionItem must be used within Accordion');

  return (
    <div className={cn('py-2', className)} data-state={context.expandedItems.has(value) ? 'open' : 'closed'}>
      {children}
    </div>
  );
}

interface AccordionTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function AccordionTrigger({ value, children, className }: AccordionTriggerProps) {
  const context = useContext(AccordionContext);
  if (!context) throw new Error('AccordionTrigger must be used within Accordion');

  const isExpanded = context.expandedItems.has(value);

  return (
    <button
      type="button"
      onClick={() => context.toggleItem(value)}
      aria-expanded={isExpanded}
      aria-controls={`content-${value}`}
      className={cn(
        'flex w-full items-center justify-between py-2 text-left',
        'text-sm font-medium text-gray-900',
        'hover:text-gray-600 transition-colors',
        className
      )}
    >
      {children}
      <ChevronDown
        className={cn(
          'w-4 h-4 text-gray-400 transition-transform duration-200',
          isExpanded && 'rotate-180'
        )}
      />
    </button>
  );
}

interface AccordionContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function AccordionContent({ value, children, className }: AccordionContentProps) {
  const context = useContext(AccordionContext);
  if (!context) throw new Error('AccordionContent must be used within Accordion');

  const isExpanded = context.expandedItems.has(value);

  if (!isExpanded) return null;

  return (
    <div
      id={`content-${value}`}
      role="region"
      className={cn('animate-slide-up pb-2 text-sm text-gray-600', className)}
    >
      {children}
    </div>
  );
}
