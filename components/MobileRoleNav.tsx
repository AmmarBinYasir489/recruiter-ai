import Link from "next/link";
import { logoutAction } from "@/app/login/actions";

export function MobileRoleNav({
  title,
  links,
}: {
  title: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:hidden">
      <div className="flex items-center justify-between gap-3">
        <Link href={links[0]?.href || "/"} className="font-bold text-ink-900">{title}</Link>
        <form action={logoutAction}><button className="btn-ghost">Sign out</button></form>
      </div>
      <nav aria-label={`${title} navigation`} className="mt-2 flex gap-1 overflow-x-auto pb-1">
        {links.map((link) => <Link key={link.href} href={link.href} className="nav-link whitespace-nowrap">{link.label}</Link>)}
      </nav>
    </header>
  );
}
