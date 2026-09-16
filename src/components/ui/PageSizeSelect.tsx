"use client";

import { cn } from "@/lib/utils";
import { NativeSelect } from "@/components/ui/NativeSelect";

export const PAGE_SIZE_OPTIONS = [4, 8, 12, 16, 24] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

type Props = {
  value: number;
  onChange: (size: number) => void;
  options?: readonly number[];
  className?: string;
};

export function PageSizeSelect({
  value,
  onChange,
  options = PAGE_SIZE_OPTIONS,
  className,
}: Props) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 text-xs text-muted",
        className,
      )}
    >
      <span className="uppercase tracking-[0.14em]">Show</span>
      <NativeSelect
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Bottles per page"
        className="min-w-[4.5rem] px-2.5 py-2"
        wrapperClassName="inline-block"
      >
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </NativeSelect>
      <span className="hidden sm:inline">per page</span>
    </label>
  );
}
