import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { candidateReturnPath, signedInDestination } from "@/lib/publicApplications";
import { authPortal } from "@/lib/authPortals";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthExperience } from "@/components/auth/AuthExperience";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; portal?: string }> }) {
  const params = await searchParams;
  const returnTo = candidateReturnPath(params.returnTo);
  const user = await getCurrentUser();
  if (user) redirect(signedInDestination(user.role, returnTo));
  return <AuthShell mode="signup"><AuthExperience mode="signup" initialPortal={authPortal(params.portal)} returnTo={returnTo} /></AuthShell>;
}
