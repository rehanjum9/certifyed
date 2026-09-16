import type { ReactNode } from "react";

interface ActivityItemProps {
  icon: ReactNode;
  text: ReactNode;
  timestamp: string;
}

export function ActivityItem({ icon, text, timestamp }: ActivityItemProps) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        {icon}
      </div>
      <p className="flex-1 text-sm text-slate-700">{text}</p>
      <span className="shrink-0 font-mono text-xs text-slate-400">{timestamp}</span>
    </div>
  );
}
