// One-time/idempotent setup: marks an existing Supabase Auth user as a
// CERTIFYED_ platform administrator (architecture report, item 2). This is
// intentionally the ONLY way to create a platform admin -- there is no UI
// for it, on purpose: platform admin status is a powerful, rarely-changed
// capability that should require direct access to your Supabase project's
// service-role key, not a button reachable from inside the app.
//
// Run with: node --env-file=.env.local scripts/bootstrap-platform-admin.mjs <email>
//
// Requires migration 0007_organizations.sql to already be applied (it
// creates the platform_admins table this writes to).
import { createClient } from "@supabase/supabase-js";

const [, , email] = process.argv;
if (!email) {
  console.error("Usage: node --env-file=.env.local scripts/bootstrap-platform-admin.mjs <email>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. Fill in .env.local first, then run this again.",
  );
  process.exit(1);
}

const supabase = createClient(url, secretKey, { auth: { persistSession: false } });

async function findUserByEmail(targetEmail) {
  const target = targetEmail.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Failed to list users: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

const user = await findUserByEmail(email);
if (!user) {
  console.error(
    `No Supabase Auth user found with email "${email}". Create the account first ` +
      "(e.g. node --env-file=.env.local scripts/create-operator.mjs <email> <password>), then run this again.",
  );
  process.exit(1);
}

const { data: existing } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();

if (existing) {
  console.log(`${email} (id: ${user.id}) is already a platform administrator. Nothing to do.`);
  process.exit(0);
}

const { error: insertError } = await supabase.from("platform_admins").insert({ user_id: user.id });
if (insertError) {
  console.error("Failed to add platform administrator:", insertError.message);
  process.exit(1);
}

console.log(`${email} (id: ${user.id}) is now a platform administrator.`);
console.log("Note: this grants /admin access only -- it does NOT add them to any workspace's data (see the architecture report's privacy rule).");
