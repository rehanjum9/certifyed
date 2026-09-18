import { createServiceRoleClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secretBox";
import type { Database } from "@/types/database";

type EmailConnectionRow = Database["public"]["Tables"]["email_connections"]["Row"];

/** Never includes the encrypted (let alone decrypted) refresh token -- what the Settings UI and any route rendering connection status actually needs. */
export interface EmailConnectionSummary {
  organizationId: string;
  senderEmail: string;
  connectedAt: string;
}

function toSummary(row: EmailConnectionRow): EmailConnectionSummary {
  return { organizationId: row.organization_id, senderEmail: row.sender_email, connectedAt: row.connected_at };
}

/** Display-only: whether/which account is connected, no secret material. */
export async function getEmailConnectionSummary(organizationId: string): Promise<EmailConnectionSummary | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("email_connections")
    .select("organization_id, sender_email, connected_at")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load email connection: ${error.message}`);
  return data ? toSummary(data as EmailConnectionRow) : null;
}

/** What lib/email/gmail.ts actually needs to send: the sender address and the DECRYPTED refresh token. Never returned from an API route -- only ever consumed server-side, immediately before a Gmail API call (see sendCertificateEmail). */
export interface ResolvedEmailConnection {
  senderEmail: string;
  refreshToken: string;
}

export async function getEmailConnectionForOrganization(organizationId: string): Promise<ResolvedEmailConnection | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("email_connections")
    .select("sender_email, encrypted_refresh_token")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load email connection: ${error.message}`);
  if (!data) return null;

  return { senderEmail: data.sender_email, refreshToken: decryptSecret(data.encrypted_refresh_token) };
}

export interface SaveEmailConnectionInput {
  organizationId: string;
  senderEmail: string;
  refreshToken: string;
  connectedBy: string;
}

/**
 * Encrypts and upserts one organization's Gmail connection. `organization_id`
 * is UNIQUE (0007_organizations.sql), so reconnecting the same organization
 * replaces its previous connection in place -- there is only ever one
 * active connection per organization by construction, never a stale
 * duplicate row.
 */
export async function saveEmailConnection(input: SaveEmailConnectionInput): Promise<EmailConnectionSummary> {
  const supabase = createServiceRoleClient();
  const encryptedRefreshToken = encryptSecret(input.refreshToken);

  const { data, error } = await supabase
    .from("email_connections")
    .upsert(
      {
        organization_id: input.organizationId,
        sender_email: input.senderEmail,
        encrypted_refresh_token: encryptedRefreshToken,
        connected_by: input.connectedBy,
      },
      { onConflict: "organization_id" },
    )
    .select("organization_id, sender_email, connected_at")
    .single();

  if (error) throw new Error(`Failed to save Gmail connection: ${error.message}`);
  return toSummary(data as EmailConnectionRow);
}

export async function deleteEmailConnection(organizationId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("email_connections").delete().eq("organization_id", organizationId);
  if (error) throw new Error(`Failed to disconnect Gmail: ${error.message}`);
}
