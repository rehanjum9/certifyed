import { describe, expect, it } from "vitest";
import { getPrimaryCta } from "./publicCta";

describe("getPrimaryCta", () => {
  it("points an unauthenticated visitor to sign in, with the default 'Get started' label", () => {
    expect(getPrimaryCta(false)).toEqual({ label: "Get started", href: "/login" });
  });

  it("allows a custom unauthenticated label (e.g. nav's 'Sign in')", () => {
    expect(getPrimaryCta(false, "Sign in")).toEqual({ label: "Sign in", href: "/login" });
  });

  it("always points an authenticated visitor to the dashboard, regardless of the unauthenticated label", () => {
    expect(getPrimaryCta(true)).toEqual({ label: "Open Dashboard", href: "/dashboard" });
    expect(getPrimaryCta(true, "Sign in")).toEqual({ label: "Open Dashboard", href: "/dashboard" });
  });
});
