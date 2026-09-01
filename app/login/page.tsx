import { Card, LinkButton } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white text-xl font-black">
            R
          </div>
          <h1 className="mt-3 text-2xl font-bold text-ink-900">Recruitment Portal</h1>
          <p className="text-sm text-slate-500">Sign in to continue</p>
        </div>
        <Card>
          <LoginForm />
          {process.env.NODE_ENV !== "production" && (
            <div className="mt-4 text-xs text-slate-400 leading-relaxed">
              Local demo accounts (password: <code>password1234</code>):
              <br />
              admin@portal.com · recruiter@portal.com · reviewer@portal.com · candidate1@portal.com
            </div>
          )}
        </Card>
        <div className="mt-4 text-center">
          <LinkButton href="/" className="btn-ghost">Browse open drives →</LinkButton>
        </div>
      </div>
    </div>
  );
}
