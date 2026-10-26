import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/shared/Icon";

interface BadgeProps {
  children: React.ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "danger" | "gold";
  icon?: IconName;
  className?: string;
}

const tones = {
  default: "bg-surface-container-highest text-on-surface",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning-strong",
  danger: "bg-error/10 text-error",
  gold: "bg-secondary/10 text-secondary",
};

export function Badge({ children, tone = "default", icon, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-body-xs font-semibold",
        tones[tone],
        className
      )}
    >
      {icon && <Icon name={icon} size="sm" className="!text-[14px]" ariaLabel={undefined} />}
      {children}
    </span>
  );
}

export function EmptyState({
  icon = "inventory_2",
  title,
  description,
  action,
  className,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-14 text-center", className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant">
        <Icon name={icon} size="xl" weight="w500" ariaLabel={undefined} />
      </div>
      <h3 className="font-heading-sm font-semibold text-on-surface">{title}</h3>
      {description && <p className="max-w-sm font-body text-on-surface-variant">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-surface-container-highest/70", className)}
      aria-hidden
    />
  );
}