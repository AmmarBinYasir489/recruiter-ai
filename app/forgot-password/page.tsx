import { Card, LinkButton } from "@/components/ui";
import { RecoveryForm } from "./RecoveryForm";

export default function RecoveryPage() {
  return <main className="grid min-h-dvh place-items-center px-4 py-8"><div className="w-full max-w-md space-y-5">
    <h1 className="text-balance text-center text-2xl font-bold">Reset your password</h1>
    <Card><RecoveryForm /></Card>
    <div className="text-center"><LinkButton className="btn-outline" href="/login">Back to sign in</LinkButton></div>
  </div></main>;
}
