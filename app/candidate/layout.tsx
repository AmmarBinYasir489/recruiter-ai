import { ActiveNavLink } from "@/components/ActiveNavLink";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import { prisma } from "@/lib/db";
import { AutoRefresh } from "@/components/AutoRefresh";
import { MobileRoleNav } from "@/components/MobileRoleNav";
import { BrandLogo } from "@/components/BrandLogo";

export default async function CandidateLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "candidate") redirect("/login");
  const unread = await prisma.notification.count({ where: { userId: user.id, read: false } });
  return (
    <div className="candidate-shell min-h-screen flex">
      <AutoRefresh />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[110] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4 hidden md:block">
        <div className="flex items-center gap-2 mb-6">
          <BrandLogo priority />
          <span className="font-bold text-ink-900">Candidate</span>
        </div>
        <nav className="space-y-1">
          <ActiveNavLink href="/candidate" className="nav-link">Dashboard</ActiveNavLink>
          <ActiveNavLink href="/" className="nav-link">Open drives</ActiveNavLink>
          <ActiveNavLink href="/candidate/notifications" className="nav-link flex items-center justify-between">
            <span>Notifications</span>
            {unread > 0 && <span className="min-w-5 rounded-full bg-brand-600 px-1.5 py-0.5 text-center text-[11px] font-bold text-white" aria-label={`${unread} unread notifications`}>{unread}</span>}
          </ActiveNavLink>
        </nav>
        <form action={logoutAction} className="mt-6">
          <button className="btn-ghost w-full">Sign out</button>
        </form>
        <div className="mt-4 text-xs text-slate-400">{user.email}</div>
      </aside>
      <div className="min-w-0 flex-1">
        <MobileRoleNav title="Candidate" links={[{ href: "/candidate", label: "Dashboard" }, { href: "/", label: "Open drives" }, { href: "/candidate/notifications", label: unread > 0 ? `Notifications (${unread})` : "Notifications" }]} />
        <main id="main-content" className="candidate-main p-4 sm:p-6 md:p-10 max-w-5xl mx-auto w-full">{children}</main>
      </div>
    </div>
  );
}
