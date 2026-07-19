interface StatusBadgeProps {
  status: string;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

const variantStyles: Record<string, string> = {
  success: 'bg-green-500/15 text-green-600 border-green-500/20',
  warning: 'bg-amber-500/15 text-amber-600 border-amber-500/20',
  danger: 'bg-red-500/15 text-red-600 border-red-500/20',
  info: 'bg-blue-500/15 text-blue-600 border-blue-500/20',
  neutral: 'bg-navy-500/15 text-navy-300 border-navy-500/20',
};

export default function StatusBadge({ status, variant = 'neutral' }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variantStyles[variant]}`}>
      {status}
    </span>
  );
}
