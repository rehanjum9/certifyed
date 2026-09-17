import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServiceRoleClient } from "./server";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret-key";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("createServiceRoleClient", () => {
  it("builds a client when both env vars are present", () => {
    expect(() => createServiceRoleClient()).not.toThrow();
  });

  it("throws a clear configuration error naming the missing var, without the secret's value, when SUPABASE_SECRET_KEY is missing", () => {
    delete process.env.SUPABASE_SECRET_KEY;
    expect(() => createServiceRoleClient()).toThrow(/SUPABASE_SECRET_KEY/);
    expect(() => createServiceRoleClient()).not.toThrow(/test-secret-key/);
  });

  it("throws a clear configuration error naming the missing var when NEXT_PUBLIC_SUPABASE_URL is missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => createServiceRoleClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("names both missing vars when neither is set", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    expect(() => createServiceRoleClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL.*SUPABASE_SECRET_KEY/);
  });
});
