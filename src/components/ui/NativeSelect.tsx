"use client";

import {
  Children,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type OptionItem = {
  value: string;
  label: string;
  disabled?: boolean;
};

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  /** Classes for the outer relative wrapper. */
  wrapperClassName?: string;
};

function collectOptions(node: ReactNode, into: OptionItem[]) {
  Children.forEach(node, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{
      value?: string | number;
      disabled?: boolean;
      children?: ReactNode;
    }>;

    if (el.type !== "option") {
      if (el.props?.children) collectOptions(el.props.children, into);
      return;
    }

    const value = String(el.props.value ?? "");
    const label =
      typeof el.props.children === "string" || typeof el.props.children === "number"
        ? String(el.props.children)
        : Children.toArray(el.props.children)
            .map((part) =>
              typeof part === "string" || typeof part === "number" ? String(part) : "",
            )
            .join("")
            .trim() || value;
    into.push({
      value,
      label,
      disabled: Boolean(el.props.disabled),
    });
  });
}

/**
 * Themed dropdown that keeps the native &lt;select&gt; API (value / onChange / &lt;option&gt; children)
 * but never uses the OS popup — so highlights match the dark/gold dashboard theme.
 *
 * Implements the WAI-ARIA "select-only combobox" pattern: focus stays on the
 * trigger, options are announced via aria-activedescendant, and Arrow / Home /
 * End / Enter / Space / Escape / type-ahead all work. `id` and extra attributes
 * (aria-describedby, aria-invalid, …) land on the visible control, so
 * `<label htmlFor>` and wrapping `<label>` both name it.
 */
export const NativeSelect = forwardRef<HTMLSelectElement, Props>(
  function NativeSelect(
    {
      className,
      wrapperClassName,
      disabled,
      children,
      value,
      defaultValue,
      onChange,
      onBlur,
      id,
      name,
      required,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      ...rest
    },
    ref,
  ) {
    const options = useMemo(() => {
      const list: OptionItem[] = [];
      collectOptions(children, list);
      return list;
    }, [children]);

    const isControlled = value !== undefined;
    const [internal, setInternal] = useState(String(defaultValue ?? options[0]?.value ?? ""));
    const selectedValue = String(isControlled ? value : internal);
    const selected =
      options.find((option) => option.value === selectedValue) ?? options[0] ?? null;

    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const rootRef = useRef<HTMLDivElement>(null);
    const hiddenRef = useRef<HTMLSelectElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const typeahead = useRef({ text: "", at: 0 });
    const baseId = useId();
    const listId = `${baseId}-list`;
    const optionId = (index: number) => `${baseId}-opt-${index}`;

    useImperativeHandle(ref, () => hiddenRef.current as HTMLSelectElement);

    useEffect(() => {
      if (!open) return;
      const onPointer = (event: MouseEvent) => {
        if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
      };
      document.addEventListener("mousedown", onPointer);
      return () => document.removeEventListener("mousedown", onPointer);
    }, [open]);

    // Keep the highlighted option scrolled into view.
    useEffect(() => {
      if (!open || activeIndex < 0) return;
      listRef.current
        ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }, [open, activeIndex]);

    const emitChange = (next: string) => {
      if (!isControlled) setInternal(next);
      if (!onChange) return;
      const target = (hiddenRef.current ?? {
        value: next,
      }) as HTMLSelectElement;
      if (hiddenRef.current) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLSelectElement.prototype,
          "value",
        )?.set;
        nativeSetter?.call(hiddenRef.current, next);
      }
      onChange({
        target,
        currentTarget: target,
      } as ChangeEvent<HTMLSelectElement>);
    };

    const enabledIndexes = options
      .map((option, index) => (option.disabled ? -1 : index))
      .filter((index) => index >= 0);
    const selectedIndex = options.findIndex((option) => option.value === selectedValue);

    const openList = () => {
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : (enabledIndexes[0] ?? -1));
      setOpen(true);
    };

    const move = (delta: number) => {
      if (!enabledIndexes.length) return;
      const pos = enabledIndexes.indexOf(activeIndex);
      const next =
        pos < 0
          ? enabledIndexes[0]!
          : enabledIndexes[Math.min(enabledIndexes.length - 1, Math.max(0, pos + delta))]!;
      setActiveIndex(next);
    };

    const commit = (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      emitChange(option.value);
      setOpen(false);
    };

    const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      switch (event.key) {
        case "ArrowDown":
        case "ArrowUp":
          event.preventDefault();
          if (!open) openList();
          else move(event.key === "ArrowDown" ? 1 : -1);
          return;
        case "Home":
        case "End":
          if (!open) return;
          event.preventDefault();
          setActiveIndex(
            (event.key === "Home"
              ? enabledIndexes[0]
              : enabledIndexes[enabledIndexes.length - 1]) ?? -1,
          );
          return;
        case "Enter":
        case " ":
          event.preventDefault();
          if (open) commit(activeIndex);
          else openList();
          return;
        case "Escape":
          if (!open) return;
          // Close only this list, not a surrounding dialog.
          event.preventDefault();
          event.stopPropagation();
          event.nativeEvent.stopImmediatePropagation();
          setOpen(false);
          return;
        case "Tab":
          if (open) setOpen(false);
          return;
        default: {
          if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return;
          const now = Date.now();
          const buffer = now - typeahead.current.at < 600 ? typeahead.current.text : "";
          const text = (buffer + event.key).toLowerCase();
          typeahead.current = { text, at: now };
          const match = enabledIndexes.find((index) =>
            options[index]!.label.toLowerCase().startsWith(text),
          );
          if (match === undefined) return;
          if (open) setActiveIndex(match);
          else emitChange(options[match]!.value);
        }
      }
    };

    return (
      <div className={cn("relative min-w-0", wrapperClassName)} ref={rootRef}>
        {/* The visible control comes first so a wrapping <label> or htmlFor names it. */}
        <button
          {...(rest as Record<string, unknown>)}
          type="button"
          id={id}
          role="combobox"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-required={required || undefined}
          onBlur={(event) => {
            if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
            (onBlur as ((e: unknown) => void) | undefined)?.(event);
          }}
          onKeyDown={onTriggerKeyDown}
          onClick={() => {
            if (disabled) return;
            if (open) setOpen(false);
            else openList();
          }}
          className={cn(
            "flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-sm border bg-white/5 px-3.5 text-left text-sm text-cream outline-none transition focus:border-(--gold)/50 focus:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gold)",
            open
              ? "border-(--gold)/50 bg-white/[0.07]"
              : "border-white/10 hover:border-white/20",
            disabled && "cursor-not-allowed opacity-50",
            className,
          )}
        >
          <span className="min-w-0 truncate">{selected?.label ?? "Select…"}</span>
          <ChevronDown
            size={14}
            aria-hidden
            className={cn("shrink-0 text-muted transition", open && "rotate-180")}
          />
        </button>

        {/* Mirrors the value for native forms (name/required) and the forwarded ref. */}
        <select
          ref={hiddenRef}
          name={name}
          required={required}
          disabled={disabled}
          value={selectedValue}
          tabIndex={-1}
          aria-hidden
          inert
          className="pointer-events-none absolute h-px w-px opacity-0"
          onChange={() => undefined}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>

        {open && !disabled ? (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabel ? undefined : ariaLabelledBy}
            tabIndex={-1}
            className="absolute top-[calc(100%+0.25rem)] left-0 right-0 z-[90] m-0 max-h-64 list-none overflow-y-auto overscroll-contain rounded-sm border border-(--gold)/35 bg-(--bg-elevated) p-1 shadow-[0_16px_48px_rgba(0,0,0,0.65)]"
          >
            {options.map((option, index) => {
              const isSelected = option.value === selectedValue;
              const highlighted = index === activeIndex;
              return (
                <li
                  key={option.value}
                  id={optionId(index)}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  // Keep focus on the trigger while clicking an option.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => {
                    if (!option.disabled) setActiveIndex(index);
                  }}
                  onClick={() => commit(index)}
                  className={cn(
                    "m-0 flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-3 py-2.5 text-left text-sm transition",
                    option.disabled && "cursor-not-allowed opacity-40",
                    isSelected ? "text-gold" : "text-cream",
                    highlighted ? "bg-white/[0.08]" : isSelected && "bg-(--gold)/15",
                  )}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  {isSelected ? <Check size={14} className="shrink-0" aria-hidden /> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    );
  },
);
