"use client";

import * as React from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  options: { value: string; label: string }[];
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
}

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  ({ className, options, placeholder, value, onChange, disabled, ...props }, ref) => {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");
    const containerRef = React.useRef<HTMLDivElement>(null);
    const searchRef = React.useRef<HTMLInputElement>(null);

    const selected = options.find((o) => o.value === value);

    // Close on outside click
    React.useEffect(() => {
      const handler = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
          setSearch("");
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, []);

    // Focus search when opened
    React.useEffect(() => {
      if (open && searchRef.current) {
        searchRef.current.focus();
      }
    }, [open]);

    const filtered = options.filter((o) =>
      o.label.toLowerCase().includes(search.toLowerCase())
    );

    const handleSelect = (val: string) => {
      onChange?.(val);
      setOpen(false);
      setSearch("");
    };

    return (
      <div ref={containerRef} className="relative">
        <button
          ref={ref}
          type="button"
          onClick={() => !disabled && setOpen(!open)}
          disabled={disabled}
          className={cn(
            "flex h-12 w-full items-center justify-between rounded-xl border border-wangari-border bg-white px-4 py-2 pr-10 text-sm transition-all",
            "focus-visible:outline-none focus-visible:border-wangari-green-800 focus-visible:ring-2 focus-visible:ring-wangari-green-800/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
            open && "border-wangari-green-800 ring-2 ring-wangari-green-800/20",
            selected ? "text-wangari-text" : "text-wangari-subtle",
            className
          )}
          {...props}
        >
          <span className="truncate">{selected?.label || placeholder || "Select..."}</span>
          <ChevronDown
            className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-wangari-subtle transition-transform",
              open && "rotate-180"
            )}
          />
        </button>

        {open && (
          <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-wangari-border bg-white shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1">
            {/* Search (only shown if > 5 options) */}
            {options.length > 5 && (
              <div className="p-2 border-b border-wangari-sunken">
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 rounded-lg border border-wangari-border bg-tone-neutral-bg px-3 text-sm text-wangari-text placeholder-wangari-subtle focus:outline-none focus:border-wangari-green-800 focus:ring-1 focus:ring-wangari-green-800/20"
                />
              </div>
            )}

            {/* Options */}
            <div className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-sm text-wangari-subtle">No options found</div>
              ) : (
                filtered.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      "flex items-center justify-between w-full px-4 py-2.5 text-sm text-left transition-colors cursor-pointer",
                      opt.value === value
                        ? "bg-wangari-green-50 text-wangari-green-800 font-semibold"
                        : "text-wangari-text hover:bg-tone-neutral-bg"
                    )}
                  >
                    <span>{opt.label}</span>
                    {opt.value === value && (
                      <Check className="h-4 w-4 text-wangari-green-800 shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
