import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

export function AuthShell({ children, mode }: { children: React.ReactNode; mode: "login" | "signup" }) {
  return <main className="auth-shell">
    <section className="auth-story" aria-label="Recruitment Portal">
      <Link href="/" className="auth-brand" aria-label="NEODYM recruitment portal home"><BrandLogo framed={false} priority className="h-10" /></Link>
      <div className="auth-story-copy">
        <span className="auth-eyebrow">PEOPLE. POTENTIAL. POSSIBILITY.</span>
        <h2>{mode === "signup" ? <>Your next<br />chapter<br /><span>starts here.</span></> : <>Good people.<br />Great teams.<br /><span>Better futures.</span></>}</h2>
        <p>{mode === "signup" ? "One account. Your next opportunity." : "A shared space for your next opportunity and your next great hire."}</p>
      </div>
      <div className="auth-story-footer"><span className="auth-story-rule" aria-hidden="true" /><span>Move forward, together.</span></div>
    </section>
    <section className="auth-content" aria-label={mode === "login" ? "Sign in" : "Create an account"}>
      <Link href="/" className="auth-back"><span aria-hidden="true">←</span> Browse opportunities</Link>
      <div className="auth-content-inner">{children}</div>
      <p className="auth-footer-note">Recruitment Portal <span aria-hidden="true">/</span> Your next step, in one place.</p>
    </section>
  </main>;
}
