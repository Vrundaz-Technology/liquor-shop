import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "border border-transparent bg-gradient-to-r from-[#9a8048] via-[#d4b56e] to-[#f0d48a] text-[#0a0a0a] font-semibold shadow-[0_0_28px_rgba(201,169,98,0.4)] ring-1 ring-[#f0d48a]/35 hover:brightness-110 hover:shadow-[0_0_36px_rgba(201,169,98,0.55)] active:brightness-95 disabled:border-white/10 disabled:bg-none disabled:bg-white/[0.04] disabled:text-white/35 disabled:font-medium disabled:shadow-none disabled:ring-0 disabled:hover:brightness-100",
  secondary:
    "bg-white/5 text-[var(--cream)] border border-white/10 hover:bg-white/10 hover:border-[var(--gold)]/40 disabled:border-white/5 disabled:bg-white/[0.03] disabled:text-white/30 disabled:hover:bg-white/[0.03] disabled:hover:border-white/5",
  ghost:
    "bg-transparent text-[var(--cream)] hover:bg-white/5 disabled:text-white/30 disabled:hover:bg-transparent",
  outline:
    "border border-[var(--gold)]/50 text-[var(--gold)] hover:bg-[var(--gold)]/10 disabled:border-white/10 disabled:text-white/30 disabled:hover:bg-transparent",
};

const sizes: Record<Size, string> = {
  sm: "min-h-9 px-3 py-1.5 text-xs tracking-wide",
  md: "min-h-11 px-5 py-2.5 text-sm tracking-wide sm:min-h-10",
  lg: "min-h-12 px-5 py-3.5 text-sm tracking-[0.12em] uppercase sm:px-8",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
    /** Shows spinner and forces disabled — clear busy vs idle primary actions */
    loading?: boolean;
  }
>(function Button(
  { className, variant = "primary", size = "md", loading = false, disabled, children, ...props },
  ref,
) {
  const isDisabled = Boolean(disabled || loading);
  return (
    <button
      ref={ref}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      className={cn(
        "inline-flex max-w-full items-center justify-center gap-2 rounded-sm touch-manipulation transition-all duration-300 disabled:cursor-not-allowed disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
