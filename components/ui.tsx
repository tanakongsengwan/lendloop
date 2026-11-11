import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
  secondary: "bg-white text-stone-800 ring-1 ring-stone-300 hover:bg-stone-100",
  danger: "bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50",
  ghost: "text-stone-600 hover:bg-stone-100",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-stone-200 bg-white p-4 shadow-xs ${className}`}>
      {children}
    </div>
  );
}

const tones = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  stone: "bg-stone-100 text-stone-700 ring-stone-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
} as const;

export function Badge({ tone = "stone", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${tones[tone]}`}>
      {children}
    </span>
  );
}

const statusTone = {
  pending: "amber",
  approved: "green",
  declined: "red",
  cancelled: "stone",
  returned: "blue",
} as const;

export function StatusBadge({ status, overdue }: { status: keyof typeof statusTone; overdue?: boolean }) {
  if (overdue) return <Badge tone="red">Overdue</Badge>;
  return <Badge tone={statusTone[status]}>{status[0].toUpperCase() + status.slice(1)}</Badge>;
}

export function TrustedBadge() {
  return <Badge tone="green">★ Trusted Lender</Badge>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-red-600">
      {children}
    </p>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-white/60 p-10 text-center">
      <p className="font-medium text-stone-700">{title}</p>
      {children && <div className="mt-1 text-sm text-stone-500">{children}</div>}
    </div>
  );
}

export function Loading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl bg-stone-200/70" />
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-stone-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function formatRange(start: string, end: string) {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}
