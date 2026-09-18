// One-time migration script (architecture report, Stage C): creates a
// single "default" workspace owned by an existing operator account, and
// backfills every pre-existing templates/campaigns/fonts row's
// organization_id to it.
//
// Run with:
//   node --env-file=.env.local scripts/backfill-default-organization.mjs <ownerEmail> ["Workspace Name"]
//
// Requires:
//   - 0007_organizations.sql applied (organizations/organization_members tables)
//   - 0008_organization_ownership.sql applied (nullable organization_id columns)
//   - the given ownerEmail already exists as a Supabase Auth user
//     (this is your existing single-operator account, e.g. created via
//     scripts/create-operator.mjs before this phase)
//
// Safe to re-run: if a workspace already owns all existing rows, it
// reports zero remaining and exits cleanly rather than creating a second
// workspace.
//
// After this script reports zero remaining NULL organization_id rows,
// apply 0009_enforce_organization_ownership.sql to make the column
// required and turn on real per-organization RLS. Do NOT apply 0009
// before this script has run successfully -- it will refuse (its own
// guard clause checks the same thing this script verifies at the end).
import { createClient } from "@supabase/supabase-js";

const [, , ownerEmail, workspaceNameArg] = process.argv;
if (!ownerEmail) {
  console.error(
    'Usage: node --env-file=.env.local scripts/backfill-default-organization.mjs <ownerEmail> ["Workspace Name"]',
  );
  process.exit(1);
}
const workspaceName = workspaceNameArg?.trim() || "Default Workspace";

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

const owner = await findUserByEmail(ownerEmail);
if (!owner) {
  console.error(`No Supabase Auth user found with email "${ownerEmail}". Double-check the address and try again.`);
  process.exit(1);
}

// Reuse an existing workspace this user already owns, if this script has
// already been run once, rather than creating a duplicate on every re-run.
const { data: existingMemberships, error: membershipError } = await supabase
  .from("organization_members")
  .select("organization_id, role")
  .eq("user_id", owner.id)
  .eq("role", "owner");

if (membershipError) {
  console.error("Failed to check existing memberships:", membershipError.message);
  process.exit(1);
}

let organizationId;
if (existingMemberships && existingMemberships.length > 0) {
  organizationId = existingMemberships[0].organization_id;
  console.log(`${ownerEmail} already owns an existing workspace (id: ${organizationId}) -- reusing it instead of creating a new one.`);
} else {
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: workspaceName, created_by: owner.id })
    .select()
    .single();

  if (orgError) {
    console.error("Failed to create the default workspace:", orgError.message);
    process.exit(1);
  }
  organizationId = org.id;

  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({ organization_id: organizationId, user_id: owner.id, role: "owner" });

  if (memberError) {
    console.error("Failed to add the owner to the new workspace:", memberError.message);
    process.exit(1);
  }

  console.log(`Created workspace "${workspaceName}" (id: ${organizationId}) owned by ${ownerEmail}.`);
}

async function backfillTable(table) {
  const { data, error } = await supabase
    .from(table)
    .update({ organization_id: organizationId })
    .is("organization_id", null)
    .select("id");

  if (error) throw new Error(`Failed to backfill ${table}: ${error.message}`);
  return data?.length ?? 0;
}

const templatesUpdated = await backfillTable("templates");
const campaignsUpdated = await backfillTable("campaigns");
const fontsUpdated = await backfillTable("fonts");

console.log(`Backfilled ${templatesUpdated} template(s), ${campaignsUpdated} campaign(s), ${fontsUpdated} font(s) to this workspace.`);

async function countRemainingNull(table) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).is("organization_id", null);
  if (error) throw new Error(`Failed to verify ${table}: ${error.message}`);
  return count ?? 0;
}

const remaining = {
  templates: await countRemainingNull("templates"),
  campaigns: await countRemainingNull("campaigns"),
  fonts: await countRemainingNull("fonts"),
};
const totalRemaining = remaining.templates + remaining.campaigns + remaining.fonts;

console.log(
  `Verification -- rows still missing an organization_id: templates=${remaining.templates}, campaigns=${remaining.campaigns}, fonts=${remaining.fonts}`,
);

if (totalRemaining === 0) {
  console.log("All existing data now has an organization. You may apply 0009_enforce_organization_ownership.sql.");
} else {
  console.error("Some rows still have no organization_id -- do NOT apply 0009_enforce_organization_ownership.sql yet. Investigate and re-run this script.");
  process.exit(1);
}
