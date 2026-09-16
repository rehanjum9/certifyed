// One-time/idempotent setup: creates the storage buckets this app needs.
// Run with: npm run setup:storage
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !secretKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. " +
      "Fill in .env.local first, then run: npm run setup:storage",
  );
  process.exit(1);
}

const supabase = createClient(url, secretKey, {
  auth: { persistSession: false },
});

const buckets = [
  { id: "certificate-templates", public: false },
  { id: "certificate-uploads", public: false },
  { id: "certificate-outputs", public: false },
];

for (const bucket of buckets) {
  const { data: existing } = await supabase.storage.getBucket(bucket.id);
  if (existing) {
    console.log(`- ${bucket.id} already exists, skipping`);
    continue;
  }

  const { error } = await supabase.storage.createBucket(bucket.id, {
    public: bucket.public,
  });

  if (error) {
    console.error(`Failed to create bucket ${bucket.id}:`, error.message);
    process.exit(1);
  }

  console.log(`+ created bucket ${bucket.id}`);
}
