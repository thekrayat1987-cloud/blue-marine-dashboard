import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  label: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  variant?: "hero" | "default";
  trend?: { value: string; positive?: boolean };
  loading?: boolean;
  empty?: boolean;
  emptyHint?: string;
  /** @deprecated kept for backwards compat with non-Overview pages — ignored */
  color?: string;
}

export default function KPICard({
  label,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
  trend,
  loading,
  empty,
  emptyHint,
}: KPICardProps) {
  const isHero = variant === "hero";

  return (
    <div
      className={`
        group relative rounded-2xl bg-surface border border-border
        transition-all duration-300
        hover:border-accent/50 hover:shadow-[0_8px_24px_-12px_rgba(200,169,110,0.25)]
        ${isHero ? "p-7" : "p-5"}
      `}
    >
      {isHero && (
        <div className="absolute top-0 left-7 right-7 h-px gold-rule" />
      )}

      <div className="flex items-start justify-between mb-4">
        <span
          className={`
            font-sans uppercase tracking-[0.14em] text-foreground-subtle
            ${isHero ? "text-[11px]" : "text-[10px]"}
          `}
        >
          {label}
        </span>
        <div
          className={`
            flex items-center justify-center rounded-lg bg-accent-soft text-accent
            ${isHero ? "w-9 h-9" : "w-8 h-8"}
          `}
        >
          <Icon className={isHero ? "w-4 h-4" : "w-3.5 h-3.5"} strokeWidth={1.75} />
        </div>
      </div>

      {loading ? (
        <div className={`skeleton rounded-md ${isHero ? "h-10 w-32" : "h-7 w-20"}`} />
      ) : empty ? (
        <>
          <p
            className={`font-display font-medium text-foreground-subtle ${isHero ? "text-3xl" : "text-2xl"}`}
          >
            —
          </p>
          {emptyHint && (
            <p className="text-[11px] text-foreground-subtle mt-2 italic">{emptyHint}</p>
          )}
        </>
      ) : (
        <>
          <p
            className={`
              font-display font-semibold text-foreground tabular-nums
              ${isHero ? "text-4xl" : "text-2xl"}
            `}
          >
            {value}
          </p>
          {(subtitle || trend) && (
            <div className="flex items-center gap-2 mt-2">
              {trend && (
                <span
                  className={`text-[11px] font-medium tabular-nums ${trend.positive ? "text-success" : "text-danger"}`}
                >
                  {trend.positive ? "↑" : "↓"} {trend.value}
                </span>
              )}
              {subtitle && (
                <span className="text-[11px] text-foreground-muted">{subtitle}</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
