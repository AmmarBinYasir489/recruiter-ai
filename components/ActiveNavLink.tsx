"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ActiveNavLink({ href, children, className = "nav-link" }: { href: string; children: React.ReactNode; className?: string }) {
  const path = usePathname();
  const root = ["/", "/candidate", "/admin", "/recruiter"].includes(href);
  const active = path === href || (!root && path.startsWith(`${href}/`));
  return <Link href={href} aria-current={active ? "page" : undefined} className={`${className} ${active ? "nav-link-active" : ""}`}>{children}</Link>;
}
