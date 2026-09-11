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
    const rootRef = useRef<HTMLDivElement>(null);
    const hiddenRef = useRef<HTMLSelectElement>(null);
    const listId = useId();

    useImperativeHandle(ref, () => hiddenRef.current as HTMLSelectElement);

    useEffect(() => {
      if (!open) return;
      const onPointer = (event: MouseEvent) => {
        if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
      };
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") setOpen(false);
      };
      document.addEventListener("mousedown", onPointer);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onPointer);
        document.removeEventListener("keydown", onKey);
      };
    }, [open]);

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

    void rest;

    return (
      <div className={cn("relative min-w-0", wrapperClassName)} ref={rootRef}>
        <select
          ref={hiddenRef}
          id={id}
          name={name}
          required={required}
          disabled={disabled}
          value={selectedValue}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute h-px w-px opacity-0"
          onChange={() => undefined}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          onBlur={onBlur as never}
          onClick={() => {
            if (!disabled) setOpen((v) => !v);
          }}
          className={cn(
            "flex h-11 w-full items-center justify-between gap-2 rounded-sm border bg-white/5 px-3.5 text-left text-sm text-cream outline-none transition focus:border-(--gold)/50 focus:bg-white/[0.07]",
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

        {open && !disabled ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className="absolute top-[calc(100%+0.25rem)] left-0 right-0 z-[90] m-0 max-h-64 list-none overflow-y-auto overscroll-contain rounded-sm border border-(--gold)/35 bg-(--bg-elevated) p-1 shadow-[0_16px_48px_rgba(0,0,0,0.65)]"
          >
            {options.map((option) => {
              const active = option.value === selectedValue;
              return (
                <li key={option.value} role="option" aria-selected={active} className="m-0 p-0">
                  <button
                    type="button"
                    disabled={option.disabled}
                    onClick={() => {
                      if (option.disabled) return;
                      emitChange(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2.5 text-left text-sm transition",
                      option.disabled && "cursor-not-allowed opacity-40",
                      active
                        ? "bg-(--gold)/15 text-gold"
                        : "text-cream hover:bg-white/[0.06]",
                    )}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                    {active ? <Check size={14} className="shrink-0" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    );
  },
);
