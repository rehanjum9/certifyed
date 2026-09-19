import { describe, expect, it } from "vitest";
import { parseInviteHash } from "./inviteHash";

describe("parseInviteHash", () => {
  it("parses a well-formed Supabase implicit invite fragment, leading # included", () => {
    const result = parseInviteHash("#access_token=abc123&refresh_token=def456&type=invite&expires_in=3600&token_type=bearer");
    expect(result).toEqual({ accessToken: "abc123", refreshToken: "def456" });
  });

  it("parses the same fragment without a leading #", () => {
    const result = parseInviteHash("access_token=abc123&refresh_token=def456&type=invite");
    expect(result).toEqual({ accessToken: "abc123", refreshToken: "def456" });
  });

  it("returns null for an empty fragment", () => {
    expect(parseInviteHash("")).toBeNull();
    expect(parseInviteHash("#")).toBeNull();
  });

  it("returns null when access_token is missing", () => {
    const result = parseInviteHash("#refresh_token=def456&type=invite");
    expect(result).toBeNull();
  });

  it("returns null when refresh_token is missing", () => {
    const result = parseInviteHash("#access_token=abc123&type=invite");
    expect(result).toBeNull();
  });

  it("returns null when type is missing entirely", () => {
    const result = parseInviteHash("#access_token=abc123&refresh_token=def456");
    expect(result).toBeNull();
  });

  it("returns null for a non-invite type (e.g. recovery/magiclink/signup) -- this landing page is invite-only", () => {
    expect(parseInviteHash("#access_token=abc123&refresh_token=def456&type=recovery")).toBeNull();
    expect(parseInviteHash("#access_token=abc123&refresh_token=def456&type=magiclink")).toBeNull();
    expect(parseInviteHash("#access_token=abc123&refresh_token=def456&type=signup")).toBeNull();
  });

  it("returns null for a completely unrelated fragment", () => {
    expect(parseInviteHash("#some-anchor")).toBeNull();
  });

  it("never echoes anything beyond the two token values it was given -- no extra fields leak through", () => {
    const result = parseInviteHash("#access_token=abc123&refresh_token=def456&type=invite&provider_token=should-not-appear");
    expect(Object.keys(result!)).toEqual(["accessToken", "refreshToken"]);
  });
});
