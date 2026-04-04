import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  label: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  color?: string;
}

export default function KPICard({ label, value, subtitle, icon: Icon, color = "text-accent" }: KPICardProps) {
  return (
    <div className="rounded-xl bg-card p-5 border border-white/5 hover:border-white/10 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </div>
  );
}
