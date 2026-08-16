import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const LEGACY_TENANT = "00000000-0000-4000-8000-000000000001";
const SECOND_TENANT = "00000000-0000-4000-8000-000000000002";

function migratedDatabase({ seedLegacyAudit = false } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");

  const migrationDirectory = new URL("../drizzle/", import.meta.url);
  const migrations = readdirSync(migrationDirectory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();

  for (const migration of migrations) {
    db.exec(readFileSync(new URL(migration, migrationDirectory), "utf8"));
    if (seedLegacyAudit && migration.startsWith("0007_")) {
      const insert = db.prepare(
        `INSERT INTO audit_events (
          engagement_id, actor_email, action, entity_type, entity_id,
          detail, previous_hash, event_hash, created_at
        ) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      insert.run(
        "legacy@example.test",
        "CLIENT_CREATED",
        "client",
        "1",
        '{"sequence":1}',
        null,
        null,
        "2025-01-01T09:00:00.000Z",
      );
      insert.run(
        "legacy@example.test",
        "ENGAGEMENT_CREATED",
        "engagement",
        "1",
        '{"sequence":2,"note":"second"}',
        null,
        null,
        "2025-01-01T09:01:00.000Z",
      );
      insert.run(
        "reviewer@example.test",
        "ENGAGEMENT_REVIEWED",
        "engagement",
        "1",
        '{"sequence":3,"approved":true}',
        "f".repeat(64),
        "e".repeat(64),
        "2025-01-01T09:02:00.000Z",
      );
    }
  }

  return db;
}

const LEGACY_HASH_SEEDS = [
  BigInt(2166136261),
  BigInt(33554467),
  BigInt(709607),
  BigInt(2246822519),
  BigInt(3266489917),
  BigInt(668265263),
  BigInt(374761393),
  BigInt(2654435761),
];

function legacyAuditDigest(row: Record<string, unknown>) {
  const payload =
    "clarity-ie:legacy-audit:v1|" +
    JSON.stringify([
      row.id,
      row.tenant_id,
      row.engagement_id,
      row.actor_email,
      row.action,
      row.entity_type,
      row.entity_id,
      row.detail,
      row.created_at,
    ]);
  return LEGACY_HASH_SEEDS.map((seed) => {
    let value = seed;
    for (const character of payload) {
      value ^= BigInt(character.codePointAt(0)!);
      value = (value * BigInt(16777619)) & BigInt("0xffffffff");
    }
    return value.toString(16).padStart(8, "0");
  }).join("");
}

function addSecondTenant(db: DatabaseSync) {
  db.prepare(
    "INSERT INTO tenants (id, slug, name) VALUES (?, ?, ?)",
  ).run(SECOND_TENANT, "second-practice", "Second Practice");
}

function insertClient(
  db: DatabaseSync,
  tenantId: string,
  publicId: string,
  charityNumber: string,
) {
  return Number(
    db
      .prepare(
        `INSERT INTO clients (
          tenant_id, public_id, name, charity_number, legal_form,
          contact_name, contact_email
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tenantId,
        publicId,
        `${charityNumber} Charity`,
        charityNumber,
        "CIO",
        "Client Contact",
        `contact-${charityNumber}@example.test`,
      ).lastInsertRowid,
  );
}

function insertEngagement(
  db: DatabaseSync,
  tenantId: string,
  publicId: string,
  clientId: number,
) {
  return Number(
    db
      .prepare(
        `INSERT INTO engagements (
          tenant_id, public_id, client_id, period_end, accounting_basis
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(tenantId, publicId, clientId, "2026-12-31", "ACCRUALS")
      .lastInsertRowid,
  );
}

test("the complete migration chain applies and installs database tenancy controls", () => {
  const db = migratedDatabase();
  try {
    const triggers = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
        .all()
        .map((row) => String(row.name)),
    );

    for (const trigger of [
      "clients_tenant_insert_guard",
      "clients_tenant_immutable",
      "engagements_parent_tenant_insert",
      "tasks_parent_tenant_insert",
      "audit_events_append_only_update",
      "audit_events_append_only_delete",
      "audit_events_chain_guard",
      "audit_events_chain_advance",
    ]) {
      assert.ok(triggers.has(trigger), `${trigger} is installed`);
    }

    assert.throws(
      () =>
        db.exec(`INSERT INTO clients (
          name, charity_number, legal_form, contact_name, contact_email
        ) VALUES ('Unscoped', 'UNSCOPED', 'CIO', 'Contact', 'contact@example.test')`),
      /requires tenant_id and public_id/,
    );
  } finally {
    db.close();
  }
});

test("legacy multi-event audit history is deterministically sealed and remains verifiable", () => {
  const first = migratedDatabase({ seedLegacyAudit: true });
  const second = migratedDatabase({ seedLegacyAudit: true });
  try {
    const selectEvents = (db: DatabaseSync) =>
      db
        .prepare(
          `SELECT id, tenant_id, engagement_id, actor_email, action,
                  entity_type, entity_id, detail, previous_hash, event_hash,
                  created_at
           FROM audit_events
           WHERE tenant_id = ?
           ORDER BY id`,
        )
        .all(LEGACY_TENANT) as Array<Record<string, unknown>>;
    const events = selectEvents(first);
    const repeated = selectEvents(second);

    assert.equal(events.length, 3);
    assert.deepEqual(
      events.map((event) => event.event_hash),
      repeated.map((event) => event.event_hash),
      "the same legacy history produces the same fingerprints",
    );
    for (const [index, event] of events.entries()) {
      assert.equal(event.event_hash, legacyAuditDigest(event));
      assert.equal(
        event.previous_hash,
        index === 0 ? null : events[index - 1].event_hash,
      );
      assert.match(String(event.event_hash), /^[0-9a-f]{64}$/);
    }

    const seal = first
      .prepare("SELECT * FROM audit_legacy_seals WHERE tenant_id = ?")
      .get(LEGACY_TENANT);
    assert.deepEqual(
      {
        algorithm: seal?.algorithm,
        canonicalVersion: seal?.canonical_version,
        firstEventId: seal?.first_event_id,
        lastEventId: seal?.last_event_id,
        eventCount: seal?.event_count,
        genesisHash: seal?.genesis_hash,
        anchorHash: seal?.anchor_hash,
      },
      {
        algorithm: "FNV1A32X8-CODEPOINT-V1",
        canonicalVersion: "clarity-ie-legacy-audit-v1",
        firstEventId: events[0].id,
        lastEventId: events[2].id,
        eventCount: 3,
        genesisHash: events[0].event_hash,
        anchorHash: events[2].event_hash,
      },
    );
    assert.equal(
      first
        .prepare("SELECT last_hash FROM audit_heads WHERE tenant_id = ?")
        .get(LEGACY_TENANT)?.last_hash,
      events[2].event_hash,
    );
    assert.throws(
      () =>
        first
          .prepare("UPDATE audit_legacy_seals SET event_count = 4 WHERE tenant_id = ?")
          .run(LEGACY_TENANT),
      /legacy audit seals are immutable/,
    );
  } finally {
    first.close();
    second.close();
  }
});

test("foreign parent identifiers cannot cross tenant boundaries", () => {
  const db = migratedDatabase();
  try {
    addSecondTenant(db);
    const firstClient = insertClient(
      db,
      LEGACY_TENANT,
      "10000000-0000-4000-8000-000000000001",
      "100001",
    );
    const firstEngagement = insertEngagement(
      db,
      LEGACY_TENANT,
      "20000000-0000-4000-8000-000000000001",
      firstClient,
    );

    assert.throws(
      () =>
        insertEngagement(
          db,
          SECOND_TENANT,
          "20000000-0000-4000-8000-000000000002",
          firstClient,
        ),
      /engagements parent belongs to another tenant/,
    );

    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO tasks (
              tenant_id, public_id, engagement_id, direction, title, objective
            ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            SECOND_TENANT,
            "30000000-0000-4000-8000-000000000002",
            firstEngagement,
            1,
            "Cross-tenant task",
            "Must be rejected",
          ),
      /tasks parent belongs to another tenant/,
    );
  } finally {
    db.close();
  }
});

test("tenant ownership is immutable after a row is created", () => {
  const db = migratedDatabase();
  try {
    addSecondTenant(db);
    const clientId = insertClient(
      db,
      LEGACY_TENANT,
      "10000000-0000-4000-8000-000000000003",
      "100003",
    );

    assert.throws(
      () =>
        db
          .prepare("UPDATE clients SET tenant_id = ? WHERE id = ?")
          .run(SECOND_TENANT, clientId),
      /clients tenant is immutable/,
    );

    assert.equal(
      db.prepare("SELECT tenant_id FROM clients WHERE id = ?").get(clientId)
        ?.tenant_id,
      LEGACY_TENANT,
    );
  } finally {
    db.close();
  }
});

test("practice settings and administrators remain independently tenant scoped", () => {
  const db = migratedDatabase();
  try {
    addSecondTenant(db);
    db.prepare(
      `INSERT INTO practice_settings (
        tenant_id, file_lock_deadline_days, retention_years, updated_by
      ) VALUES (?, ?, ?, ?)`,
    ).run(SECOND_TENANT, 30, 10, "second-admin@example.test");

    const insertAdmin = db.prepare(
      `INSERT INTO users (
        tenant_id, public_id, email, name, role
      ) VALUES (?, ?, ?, ?, 'ADMIN')`,
    );
    insertAdmin.run(
      LEGACY_TENANT,
      "40000000-0000-4000-8000-000000000001",
      "admin@example.test",
      "First Admin",
    );
    insertAdmin.run(
      SECOND_TENANT,
      "40000000-0000-4000-8000-000000000002",
      "admin@example.test",
      "Second Admin",
    );

    const settings = db
      .prepare(
        `SELECT tenant_id, file_lock_deadline_days, retention_years
         FROM practice_settings ORDER BY tenant_id`,
      )
      .all();
    assert.deepEqual(
      settings.map((row) => ({
        tenantId: row.tenant_id,
        lockDays: row.file_lock_deadline_days,
        retentionYears: row.retention_years,
      })),
      [
        { tenantId: LEGACY_TENANT, lockDays: 60, retentionYears: 7 },
        { tenantId: SECOND_TENANT, lockDays: 30, retentionYears: 10 },
      ],
    );

    const secondAdmins = db
      .prepare(
        `SELECT name FROM users
         WHERE tenant_id = ? AND email = ? AND role = 'ADMIN'`,
      )
      .all(SECOND_TENANT, "admin@example.test");
    assert.deepEqual(secondAdmins.map((row) => row.name), ["Second Admin"]);
  } finally {
    db.close();
  }
});

test("audit events are append-only and independently hash chained per tenant", () => {
  const db = migratedDatabase();
  try {
    addSecondTenant(db);
    const firstHash = "a".repeat(64);
    const secondHash = "b".repeat(64);
    const otherTenantHash = "c".repeat(64);
    const insertAudit = db.prepare(
      `INSERT INTO audit_events (
        tenant_id, public_id, engagement_id, actor_email, action,
        entity_type, entity_id, detail, previous_hash, event_hash
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, '{}', ?, ?)`,
    );

    const firstEventId = Number(
      insertAudit.run(
        LEGACY_TENANT,
        "50000000-0000-4000-8000-000000000001",
        "admin@example.test",
        "TENANT_CREATED",
        "tenant",
        LEGACY_TENANT,
        null,
        firstHash,
      ).lastInsertRowid,
    );

    assert.equal(
      db
        .prepare("SELECT last_hash FROM audit_heads WHERE tenant_id = ?")
        .get(LEGACY_TENANT)?.last_hash,
      firstHash,
    );
    assert.throws(
      () =>
        insertAudit.run(
          LEGACY_TENANT,
          "50000000-0000-4000-8000-000000000002",
          "admin@example.test",
          "SETTINGS_UPDATED",
          "practice_settings",
          LEGACY_TENANT,
          "f".repeat(64),
          secondHash,
        ),
      /audit chain conflict/,
    );

    insertAudit.run(
      LEGACY_TENANT,
      "50000000-0000-4000-8000-000000000003",
      "admin@example.test",
      "SETTINGS_UPDATED",
      "practice_settings",
      LEGACY_TENANT,
      firstHash,
      secondHash,
    );
    insertAudit.run(
      SECOND_TENANT,
      "50000000-0000-4000-8000-000000000004",
      "second-admin@example.test",
      "TENANT_CREATED",
      "tenant",
      SECOND_TENANT,
      null,
      otherTenantHash,
    );

    assert.deepEqual(
      db
        .prepare("SELECT tenant_id, last_hash FROM audit_heads ORDER BY tenant_id")
        .all()
        .map((row) => [row.tenant_id, row.last_hash]),
      [
        [LEGACY_TENANT, secondHash],
        [SECOND_TENANT, otherTenantHash],
      ],
    );
    assert.throws(
      () =>
        db
          .prepare("UPDATE audit_events SET detail = '{}' WHERE id = ?")
          .run(firstEventId),
      /audit events are append-only/,
    );
    assert.throws(
      () =>
        db.prepare("DELETE FROM audit_events WHERE id = ?").run(firstEventId),
      /audit events are append-only/,
    );
  } finally {
    db.close();
  }
});
