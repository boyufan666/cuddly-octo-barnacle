import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPhoneLookupHmac, decryptSensitiveJson } from "./sensitive-encryption";
import {
  bootstrapProduction,
  parseProductionBootstrapConfig,
  requireProductionBootstrapInput,
  type ProductionBootstrapConfig,
} from "./production-bootstrap";

const config: ProductionBootstrapConfig = {
  organization: {
    name: "客户康复中心",
    code: "customer-rehab",
    type: "rehab_center",
  },
  administrator: {
    account: "admin.bootstrap",
    displayName: "客户超级管理员",
    mobilePhone: "13900000001",
  },
  doctor: {
    account: "doctor.bootstrap",
    displayName: "客户医师",
    mobilePhone: "13900000002",
    title: "主任医师",
    department: "认知康复科",
  },
};

const expectedRoleDefinitions = [
  { code: "patient", name: "患者", level: 10 },
  { code: "caregiver", name: "家属", level: 20 },
  { code: "doctor", name: "医师", level: 30 },
  { code: "admin", name: "管理员", level: 40 },
  { code: "admin_super", name: "超级管理员", level: 43 },
  { code: "admin_operator", name: "普通运营", level: 41 },
  { code: "admin_auditor", name: "只读审计", level: 40 },
];

function writeSecret(directory: string, filename: string, value: string) {
  const path = join(directory, filename);
  writeFileSync(path, value, "utf8");
  return path;
}

function productionEnvironment(directory: string) {
  return {
    NODE_ENV: "production",
    SENSITIVE_DATA_KEY_REF: "secret-manager://customer/sensitive-data-key",
    SENSITIVE_DATA_KEY_FILE: writeSecret(
      directory,
      "sensitive_data_key",
      Buffer.alloc(32, 7).toString("base64"),
    ),
    PRODUCTION_BOOTSTRAP_CONFIG_FILE: writeSecret(
      directory,
      "production_bootstrap.json",
      JSON.stringify(config),
    ),
    PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD_FILE: writeSecret(
      directory,
      "production_bootstrap_admin_password",
      "AdminBootstrap-253913!",
    ),
    PRODUCTION_BOOTSTRAP_DOCTOR_PASSWORD_FILE: writeSecret(
      directory,
      "production_bootstrap_doctor_password",
      "DoctorBootstrap-253913!",
    ),
  };
}

test("production bootstrap config has an exact approved shape", () => {
  assert.deepEqual(parseProductionBootstrapConfig(config), config);
  assert.throws(
    () =>
      parseProductionBootstrapConfig({
        ...config,
        patient: { account: "forbidden" },
      }),
    /unsupported field/,
  );
  assert.throws(
    () =>
      parseProductionBootstrapConfig({
        ...config,
        doctor: { ...config.doctor, account: config.administrator.account },
      }),
    /must differ/,
  );
});

test("production bootstrap requires an explicit phone value or null for each account", () => {
  for (const role of ["administrator", "doctor"] as const) {
    const withoutPhone = { ...config, [role]: { ...config[role], mobilePhone: null } };
    assert.deepEqual(parseProductionBootstrapConfig(withoutPhone), withoutPhone);
    for (const mobilePhone of ["", " ", undefined, 123]) {
      assert.throws(() => parseProductionBootstrapConfig({
        ...config,
        [role]: { ...config[role], mobilePhone },
      }), /exact non-empty string/);
    }
    const { mobilePhone: _phone, ...missingPhone } = config[role];
    assert.throws(() => parseProductionBootstrapConfig({
      ...config,
      [role]: missingPhone,
    }), /unsupported field/);
  }
});

test("production bootstrap reads only direct Secret Files and rejects raw or linked sources", () => {
  const directory = mkdtempSync(join(tmpdir(), "rehab-production-bootstrap-"));
  try {
    const environment = productionEnvironment(directory);
    const input = requireProductionBootstrapInput(environment, {
      secretDirectory: directory,
    });
    assert.deepEqual(input.config, config);
    assert.equal(input.encryptionKey.key.byteLength, 32);

    assert.throws(
      () =>
        requireProductionBootstrapInput(
          { ...environment, PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD: "forbidden" },
          { secretDirectory: directory },
        ),
      /must not be defined/,
    );

    const nestedDirectory = join(directory, "nested");
    const nestedFile = join(nestedDirectory, "bootstrap.json");
    writeFileSync(nestedDirectory, "", { flag: "a" });
    assert.throws(
      () =>
        requireProductionBootstrapInput(
          { ...environment, PRODUCTION_BOOTSTRAP_CONFIG_FILE: nestedFile },
          { secretDirectory: directory },
        ),
      /directly under/,
    );

    const linkedPassword = join(directory, "linked_password");
    symlinkSync(
      environment.PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD_FILE,
      linkedPassword,
    );
    assert.throws(
      () =>
        requireProductionBootstrapInput(
          {
            ...environment,
            PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD_FILE: linkedPassword,
          },
          { secretDirectory: directory },
        ),
      /regular file/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const hasPhone of [true, false]) {
test(`production bootstrap is transactional, idempotent, and creates no patient or training records (phone=${hasPhone})`, async () => {
  const users = new Map<string, Record<string, unknown>>();
  const roleDefinitions = new Map<string, Record<string, unknown>>();
  const roleBindings = new Map<string, Record<string, unknown>>();
  const doctorProfiles = new Map<string, Record<string, unknown>>();
  const audits: Record<string, unknown>[] = [];
  const operations: string[] = [];
  let roleDefinitionCreates = 0;
  const organization = {
    id: randomUUID(),
    ...config.organization,
    status: "active",
  };
  const transaction = {
    $executeRawUnsafe: async () => {
      operations.push("advisory-lock");
      return 1;
    },
    roleDefinition: {
      upsert: async ({
        where,
        create,
      }: {
        where: { code: string };
        create: Record<string, unknown>;
      }) => {
        const existing = roleDefinitions.get(where.code);
        if (existing) return existing;
        roleDefinitionCreates += 1;
        roleDefinitions.set(where.code, create);
        return create;
      },
    },
    organization: {
      upsert: async () => organization,
    },
    user: {
      findUnique: async ({ where }: { where: { account: string } }) =>
        users.get(where.account) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: data.id,
          account: data.account,
          accountStatus: data.accountStatus,
          credentialVersion: data.credentialVersion,
          identityEnvelope: data.identityEnvelope,
          mobilePhoneLookup: data.mobilePhoneLookup,
        };
        users.set(String(data.account), created);
        return created;
      },
    },
    doctorProfile: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        doctorProfiles.get(where.userId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: randomUUID(), ...data };
        doctorProfiles.set(String(data.userId), created);
        return created;
      },
    },
    userRoleBinding: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        const key = `${create.userId}:${create.roleCode}:${create.relatedObjectId}`;
        const existing = roleBindings.get(key);
        if (existing) return existing;
        const created = {
          ...create,
          organizationId: create.organizationId ?? null,
        };
        roleBindings.set(key, created);
        return created;
      },
    },
    auditLog: {
      findFirst: async () => audits[0] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return data;
      },
    },
  };
  const prisma = {
    $transaction: async <T>(callback: (tx: typeof transaction) => Promise<T>) =>
      callback(transaction),
  };
  const input = {
    config: hasPhone ? config : {
      ...config,
      administrator: { ...config.administrator, mobilePhone: null },
      doctor: { ...config.doctor, mobilePhone: null },
    },
    administratorPassword: "AdminBootstrap-253913!",
    doctorPassword: "DoctorBootstrap-253913!",
    encryptionKey: {
      kid: "secret-manager://customer/sensitive-data-key",
      key: Buffer.alloc(32, 7),
    },
  };

  const first = await bootstrapProduction(prisma as never, input);
  const second = await bootstrapProduction(prisma as never, input);

  assert.deepEqual(second, first);
  assert.deepEqual(operations, ["advisory-lock", "advisory-lock"]);
  assert.equal(users.size, 2);
  assert.equal(roleDefinitionCreates, expectedRoleDefinitions.length);
  assert.deepEqual(
    [...roleDefinitions.values()].map(({ code, name, level, isSystemRole }) => ({
      code,
      name,
      level,
      isSystemRole,
    })),
    expectedRoleDefinitions.map((role) => ({ ...role, isSystemRole: true })),
  );
  assert.ok(roleDefinitions.has("patient"));
  assert.ok(roleDefinitions.has("caregiver"));
  for (const person of [input.config.administrator, input.config.doctor]) {
    const user = users.get(person.account)!;
    assert.deepEqual(decryptSensitiveJson(user.identityEnvelope, {
      tableName: "user", recordId: String(user.id), fieldName: "identityEnvelope",
    }, input.encryptionKey), {
      displayName: person.displayName,
      mobilePhone: person.mobilePhone,
    });
    assert.equal(user.mobilePhoneLookup, person.mobilePhone === null
      ? null
      : createPhoneLookupHmac(person.mobilePhone, input.encryptionKey.key));
  }
  assert.equal(doctorProfiles.size, 1);
  assert.equal(roleBindings.size, 2);
  assert.equal(audits.length, 1);
  assert.deepEqual(audits[0]?.metadata, {
    configFingerprint:
      audits[0]?.metadata &&
      (audits[0].metadata as { configFingerprint: string }).configFingerprint,
    users: 2,
    patientRecordsCreated: 0,
    trainingRecordsCreated: 0,
  });
});
}

for (const conflictingRole of ["patient", "caregiver"] as const) {
  test(`production bootstrap rejects a conflicting ${conflictingRole} role definition before creating accounts`, async () => {
    const roleDefinitions = new Map<string, Record<string, unknown>>();
    const roleDefinitionUpserts: string[] = [];
    let organizationWrites = 0;
    const transaction = {
      $executeRawUnsafe: async () => 1,
      roleDefinition: {
        upsert: async ({
          where,
          create,
        }: {
          where: { code: string };
          create: Record<string, unknown>;
        }) => {
          roleDefinitionUpserts.push(where.code);
          const existing = roleDefinitions.get(where.code) ?? create;
          roleDefinitions.set(where.code, existing);
          return where.code === conflictingRole
            ? { ...existing, name: "与正式策略冲突" }
            : existing;
        },
      },
      organization: {
        upsert: async () => {
          organizationWrites += 1;
          return { id: "should-not-be-created" };
        },
      },
    };
    const prisma = {
      $transaction: async <T>(callback: (tx: typeof transaction) => Promise<T>) =>
        callback(transaction),
    };

    await assert.rejects(
      bootstrapProduction(prisma as never, {
        config,
        administratorPassword: "AdminBootstrap-253913!",
        doctorPassword: "DoctorBootstrap-253913!",
        encryptionKey: {
          kid: "secret-manager://customer/sensitive-data-key",
          key: Buffer.alloc(32, 7),
        },
      }),
      new RegExp(`Role definition ${conflictingRole} does not match`),
    );
    assert.deepEqual(
      roleDefinitionUpserts,
      conflictingRole === "patient" ? ["patient"] : ["patient", "caregiver"],
    );
    assert.equal(organizationWrites, 0);
  });
}
