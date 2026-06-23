import { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  padding?: string;
}

export default function GlassCard({ children, className = '', padding = 'p-6' }: GlassCardProps) {
  return (
    <div className={`bg-navy-800/40 backdrop-blur-xl border border-navy-700/30 rounded-2xl ${padding} ${className}`}>
      {children}
    </div>
  );
}
