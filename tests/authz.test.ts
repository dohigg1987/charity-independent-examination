import assert from "node:assert/strict";
import test from "node:test";
import {
  AccessDeniedError,
  canAccessClient,
  canManagePractice,
  canPrepare,
  canRespondForClient,
  canReview,
  normaliseRole,
  requireIndependentReviewer,
  type Principal,
} from "../lib/authz";

const admin: Principal = {
  tenantId: "tenant-a",
  kind: "INTERNAL",
  email: "admin@example.org",
  name: "Admin",
  role: "ADMIN",
  clientIds: [],
  clientRoles: {},
};
const preparer: Principal = {
  tenantId: "tenant-a",
  kind: "INTERNAL",
  email: "prepare@example.org",
  name: "Preparer",
  role: "PREPARER",
  clientIds: [],
  clientRoles: {},
};
const reviewer: Principal = {
  tenantId: "tenant-a",
  kind: "INTERNAL",
  email: "review@example.org",
  name: "Reviewer",
  role: "REVIEWER",
  clientIds: [],
  clientRoles: {},
};
const contributor: Principal = {
  tenantId: "tenant-a",
  kind: "CLIENT",
  email: "client@example.org",
  name: "Client",
  role: "CONTRIBUTOR",
  clientIds: [7],
  clientRoles: { 7: "CONTRIBUTOR" },
};
const reader: Principal = {
  ...contributor,
  role: "READ_ONLY",
  clientRoles: { 7: "READ_ONLY" },
};

test("practice administration is restricted to senior internal roles", () => {
  assert.equal(canManagePractice(admin), true);
  assert.equal(canManagePractice(preparer), false);
  assert.equal(canManagePractice(contributor), false);
});

test("preparers cannot perform reviewer actions", () => {
  assert.equal(canPrepare(preparer), true);
  assert.equal(canReview(preparer), false);
  assert.equal(canReview(reviewer), true);
});

test("client access is isolated to assigned clients", () => {
  assert.equal(canAccessClient(contributor, 7, "tenant-a"), true);
  assert.equal(canAccessClient(contributor, 8, "tenant-a"), false);
  assert.equal(canAccessClient(admin, 8, "tenant-a"), true);
  assert.equal(canAccessClient(admin, 8, "tenant-b"), false);
});

test("read-only client users cannot submit responses", () => {
  assert.equal(canRespondForClient(contributor, 7), true);
  assert.equal(canRespondForClient(reader, 7), false);
});

test("client permissions are evaluated for each charity assignment", () => {
  const mixedMemberships: Principal = {
    ...contributor,
    clientIds: [7, 8],
    clientRoles: { 7: "PORTAL_ADMIN", 8: "READ_ONLY" },
  };
  assert.equal(canRespondForClient(mixedMemberships, 7), true);
  assert.equal(canRespondForClient(mixedMemberships, 8), false);
});

test("a reviewer cannot review their own prepared work", () => {
  assert.throws(
    () => requireIndependentReviewer(reviewer, reviewer.email),
    AccessDeniedError,
  );
  assert.doesNotThrow(() =>
    requireIndependentReviewer(reviewer, preparer.email),
  );
});

test("unknown roles are rejected", () => {
  assert.equal(normaliseRole("superuser"), null);
  assert.equal(normaliseRole("reviewer"), "REVIEWER");
});
