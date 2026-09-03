"use client";

import { useEffect, useState } from "react";

export function CandidateFilters({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)");
    const sync = () => setOpen(desktop.matches);
    sync(); desktop.addEventListener("change", sync);
    return () => desktop.removeEventListener("change", sync);
  }, []);
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className="candidate-filters">{children}</details>;
}
