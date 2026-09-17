import { cn } from "@/lib/cn";

interface AvatarProps {
  /** The signed-in operator's email, used only for its first letter -- never rendered in full here. */
  email: string | null;
  className?: string;
}

export function Avatar({ email, className }: AvatarProps) {
  const initial = email?.trim()?.[0]?.toUpperCase() || "?";
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 font-mono text-xs font-medium text-slate-600",
        className,
      )}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
