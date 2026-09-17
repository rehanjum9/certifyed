// One-time setup: creates the single operator account for Supabase Auth.
// Run with: node --env-file=.env.local scripts/create-operator.mjs <email> <password>
import { createClient } from "@supabase/supabase-js";

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error("Usage: node --env-file=.env.local scripts/create-operator.mjs <email> <password>");
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

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true, // skip the email-confirmation flow -- this is a single trusted operator, created out-of-band
});

if (error) {
  console.error("Failed to create operator account:", error.message);
  process.exit(1);
}

console.log(`Operator account created: ${data.user.email} (id: ${data.user.id})`);
