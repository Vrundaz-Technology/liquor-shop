"use client";

import { Search, X } from "lucide-react";
import { forwardRef, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  "aria-label"?: string;
  id?: string;
  name?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Use a plain input instead of the shared Input styles (e.g. overlay/header). */
  bare?: boolean;
};

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput(
    {
      value,
      onChange,
      onClear,
      placeholder = "Search…",
      className,
      inputClassName,
      "aria-label": ariaLabel = "Search",
      id,
      name,
      autoFocus,
      disabled,
      onKeyDown,
      bare = false,
    },
    ref,
  ) {
    const clear = () => {
      onChange("");
      onClear?.();
    };

    const sharedProps: InputHTMLAttributes<HTMLInputElement> = {
      id,
      name,
      value,
      placeholder,
      autoFocus,
      disabled,
      onKeyDown,
      "aria-label": ariaLabel,
      autoComplete: "off",
      type: "search",
      onChange: (e) => onChange(e.target.value),
    };

    return (
      <div className={cn("relative min-w-0 w-full", className)}>
        <Search
          size={14}
          className="pointer-events-none absolute top-1/2 left-3 z-[1] -translate-y-1/2 text-muted"
          aria-hidden
        />
        {bare ? (
          <input
            ref={ref}
            {...sharedProps}
            className={cn(
              "w-full h-11 rounded-sm border border-white/10 bg-white/5 pl-9 text-base text-cream outline-none placeholder:text-muted focus:border-(--gold)/40 sm:text-sm [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
              value ? "pr-9" : "pr-3",
              inputClassName,
            )}
          />
        ) : (
          <Input
            ref={ref}
            {...sharedProps}
            className={cn(
              "pl-9 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
              value ? "pr-9" : "pr-3",
              inputClassName,
            )}
          />
        )}
        {value ? (
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="absolute top-1/2 right-2 z-[1] inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted transition hover:bg-white/10 hover:text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gold) disabled:pointer-events-none disabled:opacity-40"
            aria-label="Clear search"
            title="Clear search"
          >
            <X size={14} strokeWidth={2.25} />
          </button>
        ) : null}
      </div>
    );
  },
);
