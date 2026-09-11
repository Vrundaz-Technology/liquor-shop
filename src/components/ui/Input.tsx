import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "w-full h-11 rounded-sm border border-white/10 bg-white/5 px-4 text-base text-[var(--cream)] placeholder:italic placeholder:text-[var(--placeholder)] outline-none transition focus:border-[var(--gold)]/50 focus:bg-white/[0.07] sm:text-sm",
        className,
      )}
      {...props}
    />
  );
});
