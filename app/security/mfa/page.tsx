import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAuth } from "@/lib/supabase/authServer";
import { hasStaffMfa } from "@/lib/staffMfa";
import { useSupabaseAuth } from "@/lib/supabase/authConfig";
import { signedInDestination } from "@/lib/publicApplications";
import { logoutAction } from "@/app/login/actions";
import { MfaForm } from "./MfaForm";

export default async function MfaPage() {
  const user = await getCurrentUser({ allowMfaSetup: true });
  if (!user) redirect("/login");
  if (user.role === "candidate" || !useSupabaseAuth() || await hasStaffMfa()) redirect(signedInDestination(user.role, null));
  const supabase = await getSupabaseAuth();
  const { data, error } = await supabase.auth.mfa.listFactors();
  const factor = data?.totp.find(item => item.status === "verified");
  return <main className="grid min-h-dvh place-items-center px-4 py-8"><div className="w-full max-w-md space-y-5">
    <h1 className="text-balance text-center text-2xl font-bold">Secure your staff account</h1>
    <Card><p className="mb-4 text-sm text-slate-600">Use an authenticator app to protect candidate information.</p>
      {error ? <p role="alert">Security verification is temporarily unavailable. Reload to retry.</p> : <MfaForm factorId={factor?.id} />}</Card>
    <form action={logoutAction}><button className="btn-outline min-h-11 w-full">Sign out</button></form>
  </div></main>;
}
