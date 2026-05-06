interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  size?: "sm" | "md";
}

export default function ProgressBar({ value, max = 100, color = "bg-accent", size = "sm" }: ProgressBarProps) {
  const percentage = Math.min((value / max) * 100, 100);
  return (
    <div className={`w-full rounded-full bg-surface-muted ${size === "sm" ? "h-1.5" : "h-2.5"}`}>
      <div
        className={`${color} rounded-full animate-progress ${size === "sm" ? "h-1.5" : "h-2.5"}`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
