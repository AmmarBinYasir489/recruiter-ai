import { ActiveNavLink } from "@/components/ActiveNavLink";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import { AutoRefresh } from "@/components/AutoRefresh";
import { MobileRoleNav } from "@/components/MobileRoleNav";
import { BrandLogo } from "@/components/BrandLogo";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/tiers", label: "University tiers" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/ai", label: "AI settings" },
  { href: "/admin/scores", label: "Leaderboards" },
];

// Admin has full feature control, including the recruiter-facing tools.
const RECRUITER_NAV = [
  { href: "/admin/drives", label: "Drives" },
  { href: "/admin/candidates", label: "Candidates" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");
  return (
    <div className="min-h-screen flex">
      <AutoRefresh />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[110] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4 hidden md:block">
        <div className="flex items-center gap-2 mb-6">
          <BrandLogo priority />
          <span className="font-bold text-ink-900">Admin</span>
        </div>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <ActiveNavLink key={n.href} href={n.href}>{n.label}</ActiveNavLink>
          ))}
        </nav>
        <div className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Recruiter tools</div>
        <nav className="space-y-1">
          {RECRUITER_NAV.map((n) => (
            <ActiveNavLink key={n.href} href={n.href}>{n.label}</ActiveNavLink>
          ))}
        </nav>
        <form action={logoutAction} className="mt-6">
          <button className="btn-ghost w-full">Sign out</button>
        </form>
        <div className="mt-4 text-xs text-slate-400">{user.email}</div>
      </aside>
      <div className="min-w-0 flex-1">
        <MobileRoleNav title="Admin" links={[...NAV, ...RECRUITER_NAV]} />
        <main id="main-content" className="min-w-0 w-full max-w-full overflow-x-hidden px-4 py-6 sm:px-6 md:px-10 md:py-8">{children}</main>
      </div>
    </div>
  );
}
