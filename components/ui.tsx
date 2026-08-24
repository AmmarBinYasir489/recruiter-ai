import Link from "next/link";
import type { Decision, ApplicationStatus } from "@/lib/engine/types";

export function Card({
  children,
  className = "",
  hover = false,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return <div className={`card ${hover ? "card-hover" : ""} ${className}`}>{children}</div>;
}

export function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="stat">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-2xl font-bold text-ink-900">{value}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-lg font-bold text-ink-900">{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="card text-center text-slate-400 py-10">{message}</div>
  );
}

export function decisionBadge(d: Decision | string | null | undefined): React.ReactNode {
  const v = (d || "PENDING").toString().toUpperCase();
  if (v === "PASS" || v === "ACCEPTED") return <span className="badge-pass">Pass</span>;
  if (v === "FAIL" || v === "DECLINED" || v === "REJECTED") return <span className="badge-fail">Fail</span>;
  if (v === "PENDING") return <span className="badge-pending">Pending</span>;
  if (v === "MANUAL_REVIEW") return <span className="badge-info">Review</span>;
  return <span className="badge-muted">{v}</span>;
}

export function statusBadge(s: ApplicationStatus | string | null | undefined): React.ReactNode {
  const v = (s || "").toString();
  const map: Record<string, string> = {
    DRAFT: "badge-muted",
    SUBMITTED: "badge-info",
    IN_PROGRESS: "badge-info",
    HOLD: "badge-pending",
    REJECTED: "badge-fail",
    ARCHIVED: "badge-muted",
    OFFERED: "badge-pass",
    HIRED: "badge-pass",
  };
  return <span className={map[v] || "badge-muted"}>{v.replace("_", " ")}</span>;
}

export function Pill({ children, className = "badge-muted" }: { children: React.ReactNode; className?: string }) {
  return <span className={className}>{children}</span>;
}

export function LinkButton({ href, children, className = "btn-primary" }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
