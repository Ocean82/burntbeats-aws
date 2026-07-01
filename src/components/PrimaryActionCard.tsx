import * as React from 'react';
import { cn } from '@/lib/utils';

type PrimaryActionCardProps = {
  onClick: () => void;
  children?: React.ReactNode;
  className?: string;
};

export const PrimaryActionCard: React.FC<PrimaryActionCardProps> = ({ 
  onClick, 
  children, 
  className 
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "group relative overflow-hidden rounded-2xl bg-surface-raised border border-border transition-all duration-[var(--motion-normal)] ease-[--ease-out-quart] text-left min-h-[180px] md:min-h-[240px]",
      className,
    )}
  >
    {children}
  </button>
);
