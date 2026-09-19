"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Label, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Workspace-owner-only invite form (see /api/workspace/invites). No role
 * choice -- every ordinary invite always grants "member" (two-role model,
 * owner/member -- see 0011_simplify_workspace_roles.sql). Handles both real
 * Supabase invite emails (brand-new people) and immediate membership adds
 * (someone who already has a CERTIFYED_ account elsewhere) -- the server
 * decides which, this form just reports whichever happened.
 */
export function InviteMemberForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setMessage(null);

    try {
      const response = await fetch("/api/workspace/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json().catch(() => ({}))) as { status?: string; error?: string };

      if (!response.ok) {
        setStatus("error");
        setMessage(body.error ?? "Failed to send invite.");
        return;
      }

      setStatus("success");
      setMessage(
        body.status === "added_existing_user"
          ? `${email} already had an account and was added to this workspace immediately.`
          : `Invite sent to ${email}.`,
      );
      setEmail("");
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("Failed to send invite. Check your connection.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          required
          placeholder="member@club.example"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Button type="submit" variant="secondary" disabled={status === "loading"} className="shrink-0">
        {status === "loading" && <Spinner className="h-4 w-4" />}
        Invite member
      </Button>
      {message && (
        <div className="w-full sm:mt-2">
          <Alert variant={status === "error" ? "error" : "success"}>{message}</Alert>
        </div>
      )}
    </form>
  );
}
