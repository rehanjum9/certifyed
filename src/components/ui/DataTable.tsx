import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * The one standardized data-table shell: compact rows, subtle dividers,
 * sticky header, clear hover state. Column content decides sans vs.
 * monospace per cell (IDs/statuses lean monospace, names/body stay sans).
 */
export function DataTable({ className, children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className={cn("min-w-full divide-y divide-slate-200 text-sm", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function DataTableHead({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn("sticky top-0 bg-slate-50", className)} {...props}>
      <tr>{children}</tr>
    </thead>
  );
}

export function DataTableTh({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-left font-mono text-[11px] font-medium uppercase tracking-wide text-slate-500",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function DataTableBody({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn("divide-y divide-slate-100", className)} {...props}>
      {children}
    </tbody>
  );
}

export function DataTableRow({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("transition-colors hover:bg-slate-50", className)} {...props}>
      {children}
    </tr>
  );
}

export function DataTableTd({ className, children, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <td className={cn("px-3 py-2.5 text-slate-700", className)} {...props}>
      {children}
    </td>
  );
}
