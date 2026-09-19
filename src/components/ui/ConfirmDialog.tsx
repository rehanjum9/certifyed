"use client";

import { useState, type ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";
import { inputClassName } from "@/components/ui/Input";

interface ConfirmDialogProps {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  confirmVariant?: ButtonVariant;
  /** When set, the confirm button stays disabled until the visitor types this exact text -- for the highest-blast-radius actions (see /admin/organizations "Delete workspace"). */
  requireTypedConfirmation?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Minimal, dependency-free confirmation modal -- this codebase has no
 * existing dialog/modal primitive, and pulling in a whole headless-UI
 * library for one destructive-action confirmation isn't warranted. Not a
 * full accessible dialog implementation (no focus trap) -- acceptable for
 * a platform-admin-only screen with a handful of destructive actions, not
 * a public-facing flow.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  confirmVariant = "danger",
  requireTypedConfirmation,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typedValue, setTypedValue] = useState("");
  const confirmDisabled = busy || (requireTypedConfirmation !== undefined && typedValue !== requireTypedConfirmation);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4" role="presentation" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-sm font-semibold text-slate-900">
          {title}
        </h2>
        <div className="mt-2 text-sm text-slate-500">{description}</div>

        {requireTypedConfirmation !== undefined && (
          <div className="mt-3">
            <label className="text-xs font-medium text-slate-600">
              Type <span className="font-mono text-slate-900">{requireTypedConfirmation}</span> to confirm
            </label>
            <input
              autoFocus
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              className={`${inputClassName} mt-1`}
            />
          </div>
        )}

        {error && (
          <div className="mt-3">
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant={confirmVariant} size="sm" onClick={onConfirm} disabled={confirmDisabled}>
            {busy && <Spinner className="h-3.5 w-3.5" />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
