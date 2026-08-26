import { DriveCreationForm } from "@/components/DriveCreationForm";

export default function NewDrivePage() {
  // Deadline must be today or later — past dates are not selectable.
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-ink-900 mb-6">New recruitment drive</h1>
      <DriveCreationForm today={today} backHref="/recruiter/drives" />
    </div>
  );
}
