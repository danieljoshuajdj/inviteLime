import { forwardRef } from "react";

import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/shared/Icon";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "warm";
type ButtonSize = "sm" | "md" | "lg" | "xl" | "icon";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-[#ffffff] hover:bg-[#2a2a26] focus-visible:outline-on-surface",
  secondary:
    "bg-secondary text-[#ffffff] hover:bg-[#5d4511] focus-visible:outline-secondary-container",
  outline:
    "border border-outline bg-transparent text-on-surface hover:bg-surface-container-highest focus-visible:outline-outline",
  ghost:
    "bg-transparent text-on-surface hover:bg-surface-container-highest focus-visible:outline-outline",
  danger: "bg-error text-[#ffffff] hover:opacity-90 focus-visible:outline-error",
  warm: "bg-surface text-on-surface",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-[length:var(--text-body-md)]",
  md: "h-10 px-4 text-[length:var(--text-body-md)]",
  lg: "h-12 px-6 text-[length:var(--text-body-lg)]",
  xl: "h-14 px-8 text-[length:var(--text-body-lg)]",
  icon: "h-10 w-10 p-0",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconAfter?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    icon,
    iconAfter,
    loading = false,
    fullWidth = false,
    disabled,
    children,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-body-sm font-semibold tracking-wide transition-all",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        sizes[size],
        variants[variant],
        fullWidth && "w-full",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      ) : icon ? (
        <Icon name={icon} size="sm" ariaLabel={undefined} />
      ) : null}
      {children}
      {iconAfter && !loading && (
        <Icon name={iconAfter} size="sm" ariaLabel={undefined} />
      )}
    </button>
  );
});