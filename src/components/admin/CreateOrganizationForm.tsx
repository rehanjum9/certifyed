"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Label, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";

/** Platform-admin-only (see /api/admin/organizations). Creates a new workspace with zero members and immediately invites its first owner -- the platform admin creating it is never added as a member themselves (architecture report, item 2). */
export function CreateOrganizationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setMessage(null);

    try {
      const response = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ownerEmail }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; inviteError?: string };

      if (!response.ok) {
        setStatus("error");
        setMessage(body.error ?? "Failed to create workspace.");
        return;
      }

      setStatus("success");
      setMessage(body.inviteError ? `Workspace created, but the invite failed: ${body.inviteError}` : `Workspace "${name}" created and ${ownerEmail} invited as owner.`);
      setName("");
      setOwnerEmail("");
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("Failed to create workspace. Check your connection.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="org-name">Workspace name</Label>
        <Input id="org-name" required placeholder="e.g. Robotics Club" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="org-owner-email">Initial owner email</Label>
        <Input
          id="org-owner-email"
          type="email"
          required
          placeholder="owner@club.example"
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={status === "loading"} className="shrink-0">
        {status === "loading" && <Spinner className="h-4 w-4" />}
        Create workspace
      </Button>
      {message && (
        <div className="w-full sm:mt-2">
          <Alert variant={status === "error" ? "error" : "success"}>{message}</Alert>
        </div>
      )}
    </form>
  );
}
