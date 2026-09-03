import { AuthShell } from "@/components/auth/AuthShell";
import { AuthExperience } from "@/components/auth/AuthExperience";
import { candidateReturnPath } from "@/lib/publicApplications";
import { authPortal } from "@/lib/authPortals";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; portal?: string }> }) {
  const params = await searchParams;
  return <AuthShell mode="login"><AuthExperience mode="login" initialPortal={authPortal(params.portal)} returnTo={candidateReturnPath(params.returnTo)} /></AuthShell>;
}
