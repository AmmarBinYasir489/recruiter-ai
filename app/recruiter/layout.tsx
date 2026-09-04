import { ActiveNavLink } from "@/components/ActiveNavLink";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import { AutoRefresh } from "@/components/AutoRefresh";
import { MobileRoleNav } from "@/components/MobileRoleNav";
import { BrandLogo } from "@/components/BrandLogo";

const NAV = [
  { href: "/recruiter", label: "Overview" },
  { href: "/recruiter/drives", label: "Drives" },
  { href: "/recruiter/candidates", label: "Candidates" },
];

export default async function RecruiterLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !["recruiter", "admin"].includes(user.role)) redirect("/login");
  return (
    <div className="min-h-screen flex overflow-x-hidden">
      <AutoRefresh />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[110] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4 hidden md:block">
        <div className="flex items-center gap-2 mb-6">
          <BrandLogo priority />
          <span className="font-bold text-ink-900">Recruiter</span>
        </div>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <ActiveNavLink key={n.href} href={n.href} className="nav-link">{n.label}</ActiveNavLink>
          ))}
        </nav>
        <form action={logoutAction} className="mt-6">
          <button className="btn-ghost w-full">Sign out</button>
        </form>
        <div className="mt-4 text-xs text-slate-400">{user.email}</div>
      </aside>
      <div className="min-w-0 flex-1">
        <MobileRoleNav title="Recruiter" links={NAV} />
        <main id="main-content" className="min-w-0 w-full max-w-full overflow-x-hidden px-4 py-6 sm:px-6 md:px-10 md:py-8">{children}</main>
      </div>
    </div>
  );
}
