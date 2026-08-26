import { DriveCreationForm } from "@/components/DriveCreationForm";
import { requireRole } from "@/lib/auth";

export default async function AdminNewDrivePage() {
  await requireRole("admin");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-ink-900 mb-6">New recruitment drive</h1>
      <DriveCreationForm today={today} backHref="/admin/drives" />
    </div>
  );
}
