import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import { AutoRefresh } from "@/components/AutoRefresh";
import { MobileRoleNav } from "@/components/MobileRoleNav";
import { BrandLogo } from "@/components/BrandLogo";

export default async function ReviewerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !["reviewer", "admin"].includes(user.role)) redirect("/login");
  return (
    <div className="min-h-screen flex">
      <AutoRefresh />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[110] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4 hidden md:block">
        <div className="flex items-center gap-2 mb-6">
          <BrandLogo priority />
          <span className="font-bold text-ink-900">Reviewer</span>
        </div>
        <nav className="space-y-1">
          <a href="/reviewer" className="nav-link">Submissions</a>
        </nav>
        <form action={logoutAction} className="mt-6">
          <button className="btn-ghost w-full">Sign out</button>
        </form>
        <div className="mt-4 text-xs text-slate-400">{user.email}</div>
      </aside>
      <div className="min-w-0 flex-1">
        <MobileRoleNav title="Reviewer" links={[{ href: "/reviewer", label: "Submissions" }]} />
        <main id="main-content" className="p-6 md:p-10 max-w-5xl mx-auto w-full">{children}</main>
      </div>
    </div>
  );
}
