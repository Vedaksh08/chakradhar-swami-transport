"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown } from "lucide-react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ inputs */

type FieldProps = {
  label?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function Field({ label, hint, required, className, children }: FieldProps) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="ml-0.5 text-gold-600">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="mt-1 text-[11px] text-navy-400">{hint}</p>}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cx("field", className)} {...props} />;
  }
);

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cx("field", className)} {...props}>
      {children}
    </select>
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cx("field", className)} {...props} />;
});

/* ---------------------------------------------------------------- combobox */

export interface ComboOption {
  value: string;
  label: string;
  /** Small grey text on the right of the row — a code, a phone number. */
  hint?: string;
}

/**
 * A dropdown you can type into.
 *
 * A plain <select> makes you hunt through a hundred parties by eye; this
 * narrows the list as you type while keeping the arrow for a straight browse.
 * The list is portalled to <body> at fixed coordinates because these sit
 * inside modals that scroll, and an absolutely positioned menu would be
 * clipped by the modal's own overflow.
 */
export function Combo({
  options,
  value,
  onChange,
  placeholder = "Select…",
  /** Let anything typed stand as the value — vehicle numbers, delivery names. */
  allowCustom = false,
  /** Applied to typed text before it's committed, e.g. uppercasing. */
  transform,
  disabled,
  className,
}: {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowCustom?: boolean;
  transform?: (raw: string) => string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const selected = options.find((o) => o.value === value);
  const shownText = open ? query : (selected?.label ?? (allowCustom ? value : ""));

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!open || !q) return options;
    // Anything containing what was typed, with the closest starts-with
    // matches lifted to the top.
    const hit = options.filter((o) => o.label.toLowerCase().includes(q));
    return hit.sort((a, b) => {
      const aStarts = a.label.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.label.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts;
    });
  }, [options, query, open]);

  const place = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 4, width: r.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    // Capture phase so a scroll inside the modal body is caught too.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (inputRef.current?.parentElement?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  });

  function close(commitTyped: boolean) {
    if (commitTyped && allowCustom) {
      const raw = transform ? transform(query) : query;
      if (raw !== value) onChange(raw);
    }
    setOpen(false);
    setQuery("");
  }

  function pick(option: ComboOption) {
    onChange(option.value);
    setOpen(false);
    setQuery("");
  }

  function openList() {
    if (disabled) return;
    setQuery("");
    setActive(0);
    setOpen(true);
  }

  return (
    <div className="relative">
      <div className="flex">
        <input
          ref={inputRef}
          className={cx("field pr-9", className)}
          value={shownText}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          onFocus={openList}
          onChange={(e) => {
            if (!open) setOpen(true);
            setQuery(transform ? transform(e.target.value) : e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!open) return openList();
              setActive((i) => Math.min(i + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              if (!open) return;
              e.preventDefault();
              if (matches[active]) pick(matches[active]);
              else close(true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              close(false);
            } else if (e.key === "Tab") {
              close(true);
            }
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onMouseDown={(e) => {
            // mousedown, not click: the outside-click handler would otherwise
            // close the list before this ever fired.
            e.preventDefault();
            open ? close(true) : (inputRef.current?.focus(), openList());
          }}
          className="pointer-events-auto absolute right-0 top-0 grid h-full w-9 place-items-center text-navy-400 transition hover:text-navy-700 disabled:opacity-40"
          aria-label="Show list"
        >
          <ChevronDown size={16} className={cx("transition", open && "rotate-180")} />
        </button>
      </div>

      {open &&
        mounted &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            style={{ left: rect.left, top: rect.top, width: rect.width }}
            className="animate-fade fixed z-[60] max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-navy-200 bg-white py-1 shadow-pop"
          >
            {matches.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-navy-400">
                {allowCustom
                  ? "Nothing matches — press Enter to use what you typed."
                  : "Nothing matches."}
              </p>
            ) : (
              matches.map((o, i) => (
                <button
                  key={o.value || `blank-${i}`}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o);
                  }}
                  className={cx(
                    "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition",
                    i === active ? "bg-navy-100 text-navy-900" : "text-navy-700 hover:bg-navy-50",
                    o.value === value && "font-bold"
                  )}
                >
                  <span className="min-w-0 truncate">{o.label}</span>
                  {o.hint && (
                    <span className="shrink-0 font-mono text-[11px] text-navy-400">{o.hint}</span>
                  )}
                </button>
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

/* ------------------------------------------------------------------- cards */

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-bold text-navy-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-navy-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx(bodyClassName ?? "p-4")}>{children}</div>
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold tracking-tight text-navy-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-navy-500 sm:text-sm">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
          {actions}
        </div>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------- modal */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  // Portalled to <body> so no ancestor transform (page animations create a
  // stacking context) can trap the overlay beneath the mobile tab bar.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="animate-fade fixed inset-0 z-50 flex items-end justify-center overflow-y-auto overscroll-contain bg-navy-950/50 backdrop-blur-sm sm:items-start sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cx(
          // Full-height sheet on phones, centred card from `sm` up.
          "animate-pop flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-pop",
          "sm:my-6 sm:max-h-none sm:rounded-2xl",
          wide ? "sm:max-w-5xl" : "sm:max-w-2xl"
        )}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between gap-4 rounded-t-2xl border-b border-navy-100 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-navy-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-navy-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="-m-1.5 shrink-0 rounded-lg p-2.5 text-navy-400 transition hover:bg-navy-50 hover:text-navy-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-navy-100 bg-navy-50/95 px-5 py-3 backdrop-blur sm:rounded-b-2xl [&>button]:flex-1 sm:[&>button]:flex-none">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------- misc */

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && <div className="text-navy-300">{icon}</div>}
      <div>
        <p className="text-sm font-semibold text-navy-800">{title}</p>
        {message && <p className="mx-auto mt-1 max-w-sm text-sm text-navy-500">{message}</p>}
      </div>
      {action}
    </div>
  );
}

export function Chip({
  tone = "navy",
  children,
}: {
  tone?: "navy" | "gold" | "green" | "red" | "slate";
  children: React.ReactNode;
}) {
  const tones = {
    navy: "bg-navy-100 text-navy-700",
    gold: "bg-gold-100 text-gold-800",
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    slate: "bg-navy-50 text-navy-500",
  } as const;
  return <span className={cx("chip", tones[tone])}>{children}</span>;
}

export function Stat({
  label,
  value,
  sub,
  tone = "navy",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "navy" | "gold" | "green" | "red";
  icon?: React.ReactNode;
}) {
  const accents = {
    navy: "text-navy-900",
    gold: "text-gold-600",
    green: "text-emerald-600",
    red: "text-red-600",
  } as const;
  return (
    <div className="card p-3 transition hover:shadow-pop sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-navy-500 sm:text-[11px]">
          {label}
        </p>
        {icon && <span className="hidden text-navy-300 sm:block">{icon}</span>}
      </div>
      {/* Amounts are shown in full, so the type has to give way on narrow tiles
          rather than overflow. */}
      <p
        className={cx(
          "tabular mt-1.5 break-all text-lg font-extrabold leading-tight tracking-tight sm:mt-2 sm:text-xl lg:text-2xl",
          accents[tone]
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-navy-500 sm:text-xs">{sub}</p>}
    </div>
  );
}

export function Table({
  head,
  children,
  className,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className="w-full min-w-full">
        <thead className="bg-navy-50/70">
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Image picker that downsizes to a data URL so scans stay small. */
export function ImagePicker({
  label,
  value,
  onChange,
  aspect = "aspect-[4/3]",
}: {
  label: string;
  value?: string;
  onChange: (dataUrl?: string) => void;
  aspect?: string;
}) {
  const id = React.useId();

  async function handle(file?: File) {
    if (!file) return;
    const dataUrl = await downscale(file, 1400, 0.75);
    onChange(dataUrl);
  }

  return (
    <div>
      <span className="label">{label}</span>
      {value ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={label}
            className={cx("w-full rounded-lg border border-navy-200 object-cover", aspect)}
          />
          <div className="absolute right-2 top-2 flex gap-1">
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-white/95 px-2 py-1 text-[11px] font-semibold text-navy-700 shadow"
            >
              View
            </a>
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="rounded-md bg-white/95 px-2 py-1 text-[11px] font-semibold text-red-600 shadow"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={cx(
            "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-navy-200 bg-navy-50/50 text-center transition hover:border-navy-400 hover:bg-navy-50",
            aspect
          )}
        >
          <span className="text-xs font-semibold text-navy-600">Click to upload</span>
          <span className="text-[11px] text-navy-400">PNG / JPG</span>
        </label>
      )}
      <input
        id={id}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
    </div>
  );
}

/** Resize + re-encode an image file to keep localStorage / Postgres rows small. */
export function downscale(file: File, maxDim = 1400, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read image"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unavailable"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
