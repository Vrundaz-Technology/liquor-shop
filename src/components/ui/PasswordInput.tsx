"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const PasswordInput = forwardRef<HTMLInputElement, Props>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          {...props}
          type={visible ? "text" : "password"}
          className={cn("pr-11", className)}
        />
        <Tooltip
          content={visible ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 z-[1] -translate-y-1/2"
        >
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="rounded-sm p-1.5 text-muted transition hover:text-cream"
          tabIndex={-1}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          <span className="sr-only">
            {visible ? "Hide password characters" : "Show password characters"}
          </span>
        </button>
        </Tooltip>
      </div>
    );
  },
);
