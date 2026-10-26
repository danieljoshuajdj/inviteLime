import { forwardRef, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/shared/Icon";

interface FieldWrapProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function FieldWrap({ label, hint, error, required, className, children }: FieldWrapProps) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={id} className="font-body-sm font-medium text-on-surface-variant">
          {label}
          {required && <span className="text-error"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="flex items-center gap-1 font-body-xs text-error">
          <Icon name="error" size="sm" className="!text-[14px]" />
          {error}
        </p>
      ) : hint ? (
        <p className="font-body-xs text-on-surface-variant">{hint}</p>
      ) : null}
    </div>
  );
}

const inputBase =
  "w-full rounded-lg border border-outline-variant bg-surface px-3.5 py-2.5 font-body text-on-surface " +
  "placeholder:text-on-surface-variant/60 transition-colors focus:border-primary focus:outline-none " +
  "focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-surface-container-highest/50";

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: IconName;
  labelProps?: React.LabelHTMLAttributes<HTMLLabelElement>;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, label, hint, error, required, icon, ...props },
  ref
) {
  return (
    <FieldWrap label={label} hint={hint} error={error} required={required} className={className}>
      <div className="relative">
        {icon && (
          <Icon
            name={icon}
            size="sm"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
          />
        )}
        <input
          ref={ref}
          className={cn(inputBase, icon && "pl-9", error && "border-error focus:ring-error/20")}
          required={required}
          aria-invalid={!!error}
          {...props}
        />
      </div>
    </FieldWrap>
  );
});

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, label, hint, error, required, options, placeholder, ...props },
  ref
) {
  return (
    <FieldWrap label={label} hint={hint} error={error} required={required} className={className}>
      <div className="relative">
        <select
          ref={ref}
          className={cn(inputBase, "appearance-none pr-9", error && "border-error", className)}
          required={required}
          aria-invalid={!!error}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon
          name="keyboard_arrow_down"
          size="sm"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
        />
      </div>
    </FieldWrap>
  );
});

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, label, hint, error, required, rows = 4, ...props },
  ref
) {
  return (
    <FieldWrap label={label} hint={hint} error={error} required={required} className={className}>
      <textarea
        ref={ref}
        rows={rows}
        className={cn(inputBase, error && "border-error", className)}
        required={required}
        aria-invalid={!!error}
        {...props}
      />
    </FieldWrap>
  );
});

interface ToggleProps {
  label?: string;
  description?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
}

export function Toggle({ label, description, checked, onChange, className, disabled }: ToggleProps) {
  return (
    <label className={cn("flex items-start gap-3 text-start", disabled && "opacity-60", className)}>
      <span className="relative mt-0.5 inline-block h-6 w-11 shrink-0 cursor-pointer">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
        />
        <span className="absolute inset-0 rounded-full bg-outline-variant transition-colors peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-on-secondary shadow transition-transform peer-checked:translate-x-5" />
      </span>
      {(label || description) && (
        <span className="flex flex-col gap-0.5">
          <span className="font-body-sm font-semibold text-on-surface">{label}</span>
          {description && (
            <span className="font-body-xs text-on-surface-variant">{description}</span>
          )}
        </span>
      )}
    </label>
  );
}

interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  value: string[];
  onChange: (value: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  emptyText?: string;
  className?: string;
}

export function MultiSelect({ label, hint, error, required, value, onChange, options, placeholder, emptyText = "No categories found", className }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<{ top: number; left: number; width: number; maxHeight: number; upward: boolean } | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const maxH = 240;
    const below = window.innerHeight - rect.bottom - gap;
    const upward = below < Math.min(maxH, 180) && rect.top > below;
    const maxHeight = upward ? Math.min(maxH, Math.max(120, rect.top - gap)) : Math.min(maxH, Math.max(120, below));
    setOrigin({ top: upward ? rect.top - gap : rect.bottom + gap, left: rect.left, width: rect.width, maxHeight, upward });
  }, []);

  useEffect(() => {
    if (!open) return;
    measure();
    const onPageScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", onPageScroll, true);
    window.addEventListener("resize", () => setOpen(false));
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onPageScroll, true);
      window.removeEventListener("resize", () => setOpen(false));
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, measure]);

  const handleToggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const handleOpenToggle = () => {
    if (open) {
      setOpen(false);
    } else {
      measure();
      setOpen(true);
    }
  };

  const displayText = value.length === 0
    ? placeholder
    : value.length <= 2
    ? value.map((v) => options.find((o) => o.value === v)?.label ?? v).join(", ")
    : `${value.length} selected`;

  return (
    <FieldWrap label={label} hint={hint} error={error} required={required} className={className}>
      <div className="relative" ref={triggerRef}>
        <button
          type="button"
          className={cn(
            "w-full flex items-center justify-between text-left px-3 py-2 rounded-lg border appearance-none transition-colors pr-8",
            error ? "border-error focus:ring-error/20" : "border-outline-variant focus:ring-primary/20",
            "bg-surface hover:bg-surface-container"
          )}
          onClick={handleOpenToggle}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className={cn("flex-1 truncate", value.length === 0 ? "text-on-surface-variant" : "text-on-surface")}>
            {displayText}
          </span>
          <Icon
            name={open ? "keyboard_arrow_up" : "keyboard_arrow_down"}
            size="sm"
            className="flex-shrink-0 ml-2 text-on-surface-variant"
          />
        </button>
        {open && origin && createPortal(
          <div
            ref={menuRef}
            style={{ top: origin.top, left: origin.left, width: origin.width, maxHeight: origin.maxHeight }}
            className={cn(
              "fixed z-[130] overflow-auto rounded-lg border border-outline-variant bg-surface-container shadow-lg",
              origin.upward && "origin-bottom mb-0"
            )}
          >
            {options.length === 0 ? (
              <div className="px-3 py-2 text-center text-on-surface-variant font-body-sm">
                {emptyText}
              </div>
            ) : (
              options.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-surface-container-highest cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={value.includes(option.value)}
                    onChange={() => handleToggle(option.value)}
                    className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/20"
                  />
                  <span className="font-body-sm text-on-surface">{option.label}</span>
                </label>
              ))
            )}
          </div>,
          document.body
        )}
      </div>
    </FieldWrap>
  );
}