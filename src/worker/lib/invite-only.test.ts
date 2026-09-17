import { describe, expect, it } from "vitest";
import {
  accountExists,
  canCreateAccount,
  inviteOnlyError,
  isAdminEmail,
  isBootstrapEmail,
  shouldCreateWorkspace,
  signInEmailFromRequest,
} from "./invite-only";
import { INVITE_ONLY_CODE } from "@shared/invite-only";
import { createD1Stub } from "../../test/d1-stub";

// import.meta.env.DEV is true under Vitest, so the e2e-domain bootstrap check below is live.

function makeEnv(overrides: { ADMIN_EMAILS?: string; DB?: D1Database } = {}): Env {
  const { db } = createD1Stub();
  return {
    ADMIN_EMAILS: overrides.ADMIN_EMAILS ?? "owner@company.com",
    DB: overrides.DB ?? db,
  } as unknown as Env;
}

describe("isAdminEmail", () => {
  it("matches an ADMIN_EMAILS address case-insensitively", () => {
    const env = makeEnv({ ADMIN_EMAILS: "Owner@Company.com, second@company.com" });
    expect(isAdminEmail(env, "owner@company.com")).toBe(true);
    expect(isAdminEmail(env, "SECOND@COMPANY.COM")).toBe(true);
  });

  it("rejects anything not listed", () => {
    const env = makeEnv({ ADMIN_EMAILS: "owner@company.com" });
    expect(isAdminEmail(env, "stranger@company.com")).toBe(false);
  });

  it("treats an unset ADMIN_EMAILS as an empty list", () => {
    const env = makeEnv({ ADMIN_EMAILS: "" });
    expect(isAdminEmail(env, "owner@company.com")).toBe(false);
  });
});

describe("isBootstrapEmail", () => {
  it("trusts an admin email", () => {
    const env = makeEnv({ ADMIN_EMAILS: "owner@company.com" });
    expect(isBootstrapEmail(env, "owner@company.com")).toBe(true);
  });

  it("trusts the e2e domain in dev", () => {
    const env = makeEnv({ ADMIN_EMAILS: "owner@company.com" });
    expect(isBootstrapEmail(env, "someone@example.com")).toBe(true);
  });

  it("rejects a non-admin, non-e2e address", () => {
    const env = makeEnv({ ADMIN_EMAILS: "owner@company.com" });
    expect(isBootstrapEmail(env, "stranger@gmail.com")).toBe(false);
  });
});

describe("canCreateAccount", () => {
  it("allows a bootstrap email outright, without consulting the database", async () => {
    const { db, calls } = createD1Stub();
    const env = makeEnv({ ADMIN_EMAILS: "owner@company.com", DB: db });
    expect(await canCreateAccount(env, "owner@company.com")).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("allows an email with a pending, unexpired invitation from a bootstrap-owned workspace", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const { db } = createD1Stub({
      all: () => ({ results: [{ expires_at: future, owner_email: "owner@company.com" }] }),
    });
    const env = makeEnv({ ADMIN_EMAILS: "owner@company.com", DB: db });
    expect(await canCreateAccount(env, "invitee@gmail.com")).toBe(true);
  });

  it("rejects an expired invitation", async () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const { db } = createD1Stub({
      all: () => ({ results: [{ expires_at: past, owner_email: "owner@company.com" }] }),
    });
    const env = makeEnv({ ADMIN_EMAILS: "owner@company.com", DB: db });
    expect(await canCreateAccount(env, "invitee@gmail.com")).toBe(false);
  });

  it("rejects an invitation from a workspace not owned by a bootstrap email", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const { db } = createD1Stub({
      all: () => ({ results: [{ expires_at: future, owner_email: "not-an-admin@gmail.com" }] }),
    });
    const env = makeEnv({ ADMIN_EMAILS: "owner@company.com", DB: db });
    expect(await canCreateAccount(env, "invitee@gmail.com")).toBe(false);
  });

  it("rejects an email with no invitation at all", async () => {
    const { db } = createD1Stub({ all: () => ({ results: [] }) });
    const env = makeEnv({ ADMIN_EMAILS: "owner@company.com", DB: db });
    expect(await canCreateAccount(env, "stranger@gmail.com")).toBe(false);
  });
});

describe("accountExists", () => {
  it("is true when a user row is found", async () => {
    const { db } = createD1Stub({ first: () => ({ 1: 1 }) });
    const env = makeEnv({ DB: db });
    expect(await accountExists(env, "someone@company.com")).toBe(true);
  });

  it("is false when no row is found", async () => {
    const { db } = createD1Stub({ first: () => null });
    const env = makeEnv({ DB: db });
    expect(await accountExists(env, "nobody@company.com")).toBe(false);
  });
});

describe("shouldCreateWorkspace", () => {
  it("is true for the e2e domain in dev, without touching the database", async () => {
    const { db, calls } = createD1Stub();
    const env = makeEnv({ DB: db });
    expect(await shouldCreateWorkspace(env, "user@example.com")).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("is false for a non-admin email", async () => {
    const env = makeEnv({ ADMIN_EMAILS: "owner@company.com" });
    expect(await shouldCreateWorkspace(env, "stranger@gmail.com")).toBe(false);
  });

  it("is true for the admin email only when no workspace exists yet", async () => {
    const { db } = createD1Stub({ first: () => null });
    const env = makeEnv({ ADMIN_EMAILS: "owner@company.com", DB: db });
    expect(await shouldCreateWorkspace(env, "owner@company.com")).toBe(true);
  });

  it("is false for the admin email once a workspace already exists", async () => {
    const { db } = createD1Stub({ first: () => ({ 1: 1 }) });
    const env = makeEnv({ ADMIN_EMAILS: "owner@company.com", DB: db });
    expect(await shouldCreateWorkspace(env, "owner@company.com")).toBe(false);
  });
});

describe("signInEmailFromRequest", () => {
  it("reads the email off a magic-link request", () => {
    expect(signInEmailFromRequest("/sign-in/magic-link", { email: "User@Company.com" })).toBe(
      "user@company.com"
    );
  });

  it("reads the email off a sign-in OTP request, but not other OTP types", () => {
    expect(
      signInEmailFromRequest("/email-otp/send-verification-otp", { email: "a@b.com", type: "sign-in" })
    ).toBe("a@b.com");
    expect(
      signInEmailFromRequest("/email-otp/send-verification-otp", { email: "a@b.com", type: "forget-password" })
    ).toBeNull();
  });

  it("is null for an unrelated path", () => {
    expect(signInEmailFromRequest("/sign-in/email", { email: "a@b.com" })).toBeNull();
  });

  it("is null for a malformed or missing body", () => {
    expect(signInEmailFromRequest("/sign-in/magic-link", null)).toBeNull();
    expect(signInEmailFromRequest("/sign-in/magic-link", "not-an-object")).toBeNull();
    expect(signInEmailFromRequest("/sign-in/magic-link", { email: 42 })).toBeNull();
  });
});

describe("inviteOnlyError", () => {
  it("carries the shared invite-only code", () => {
    const error = inviteOnlyError();
    expect(error.body?.code).toBe(INVITE_ONLY_CODE);
  });
});
