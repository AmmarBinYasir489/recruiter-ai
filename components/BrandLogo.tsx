import Image from "next/image";

export function BrandLogo({ framed = true, priority = false, className = "" }: { framed?: boolean; priority?: boolean; className?: string }) {
  return (
    <span className={framed ? "inline-flex shrink-0 items-center rounded-xl bg-ink-900 px-2 py-1" : "inline-flex shrink-0 items-center"}>
      <Image
        src="/brand/neodym-logo.png"
        alt="NEODYM"
        width={150}
        height={40}
        priority={priority}
        className={`h-8 w-auto object-contain ${className}`}
      />
    </span>
  );
}
