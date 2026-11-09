import { PrismaClient, type Prisma, type RoleCode } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { requireSensitiveBackfillKey } from "./backfill-sensitive-encryption";
import {
  hashCredential,
  validateCredentialPassword,
} from "./credential-security";
import {
  createPhoneLookupHmac,
  decryptSensitiveJson,
  encryptSensitiveJson,
  type SensitiveEncryptionKey,
} from "./sensitive-encryption";

const RENDER_SECRET_DIRECTORY = "/etc/secrets";
const PRODUCTION_BOOTSTRAP_LOCK = "rehab-platform-production-bootstrap-v1";
const ACCOUNT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;
const ORGANIZATION_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;
const PRODUCTION_ROLE_DEFINITIONS: Array<{
  code: RoleCode;
  name: string;
  level: number;
}> = [
  { code: "patient", name: "患者", level: 10 },
  { code: "caregiver", name: "家属", level: 20 },
  { code: "doctor", name: "医师", level: 30 },
  { code: "admin", name: "管理员", level: 40 },
  { code: "admin_super", name: "超级管理员", level: 43 },
  { code: "admin_operator", name: "普通运营", level: 41 },
  { code: "admin_auditor", name: "只读审计", level: 40 },
];

export type ProductionBootstrapConfig = {
  organization: {
    name: string;
    code: string;
    type: string;
  };
  administrator: {
    account: string;
    displayName: string;
    mobilePhone: string | null;
  };
  doctor: {
    account: string;
    displayName: string;
    mobilePhone: string | null;
    title: string;
    department: string;
  };
};

export type ProductionBootstrapInput = {
  config: ProductionBootstrapConfig;
  administratorPassword: string;
  doctorPassword: string;
  encryptionKey: SensitiveEncryptionKey;
};

export type ProductionBootstrapSecretOptions = {
  secretDirectory?: string;
};

type BootstrapTransaction = Prisma.TransactionClient;

function requireExactEnvironmentValue(
  environment: Record<string, string | undefined>,
  name: string,
  message: string,
) {
  const value = environment[name];
  if (!value || value.trim() !== value) {
    throw new Error(message);
  }
  return value;
}

function readDirectSecretFile(
  environment: Record<string, string | undefined>,
  name: string,
  options: ProductionBootstrapSecretOptions,
) {
  const configuredPath = requireExactEnvironmentValue(
    environment,
    name,
    `${name} must be an exact non-empty Secret File path in production.`,
  );
  if (!isAbsolute(configuredPath)) {
    throw new Error(`${name} must be an absolute Secret File path.`);
  }

  const secretDirectory = resolve(
    options.secretDirectory ?? RENDER_SECRET_DIRECTORY,
  );
  const resolvedPath = resolve(configuredPath);
  const pathFromSecretDirectory = relative(secretDirectory, resolvedPath);
  if (
    pathFromSecretDirectory === "" ||
    pathFromSecretDirectory.startsWith("..") ||
    isAbsolute(pathFromSecretDirectory) ||
    pathFromSecretDirectory.includes(sep)
  ) {
    throw new Error(`${name} must point directly under ${secretDirectory}.`);
  }

  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(resolvedPath);
  } catch {
    throw new Error(`${name} Secret File is unavailable.`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${name} must point to a regular file.`);
  }

  let value: string;
  try {
    value = readFileSync(resolvedPath, "utf8");
  } catch {
    throw new Error(`${name} Secret File cannot be read.`);
  }
  if (!value || value.trim() !== value) {
    throw new Error(
      `${name} Secret File must contain one exact non-empty value.`,
    );
  }
  return value;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: string[],
) {
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    throw new Error(
      "Production bootstrap config contains an unsupported field.",
    );
  }
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, label: string, maximumLength = 128) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    value.trim() !== value
  ) {
    throw new Error(`${label} must be an exact non-empty string.`);
  }
  return value;
}

function parsePerson(
  value: unknown,
  label: "administrator" | "doctor",
): ProductionBootstrapConfig["administrator"] &
  Partial<Pick<ProductionBootstrapConfig["doctor"], "title" | "department">> {
  const person = requireObject(value, label);
  assertExactKeys(
    person,
    label === "doctor"
      ? ["account", "displayName", "mobilePhone", "title", "department"]
      : ["account", "displayName", "mobilePhone"],
  );
  const account = requireText(person.account, `${label}.account`, 64);
  if (!ACCOUNT_PATTERN.test(account)) {
    throw new Error(`${label}.account has an unsupported format.`);
  }
  const result = {
    account,
    displayName: requireText(person.displayName, `${label}.displayName`),
    mobilePhone: person.mobilePhone === null
      ? null
      : requireText(person.mobilePhone, `${label}.mobilePhone`, 32),
  };
  if (label === "doctor") {
    return {
      ...result,
      title: requireText(person.title, "doctor.title"),
      department: requireText(person.department, "doctor.department"),
    };
  }
  return result;
}

export function parseProductionBootstrapConfig(
  value: unknown,
): ProductionBootstrapConfig {
  const raw = requireObject(value, "production bootstrap config");
  assertExactKeys(raw, ["organization", "administrator", "doctor"]);
  const organization = requireObject(raw.organization, "organization");
  assertExactKeys(organization, ["name", "code", "type"]);
  const code = requireText(organization.code, "organization.code", 64);
  if (!ORGANIZATION_CODE_PATTERN.test(code)) {
    throw new Error("organization.code has an unsupported format.");
  }
  const administrator = parsePerson(raw.administrator, "administrator");
  const doctor = parsePerson(raw.doctor, "doctor");
  if (administrator.account === doctor.account) {
    throw new Error("administrator.account and doctor.account must differ.");
  }
  return {
    organization: {
      name: requireText(organization.name, "organization.name"),
      code,
      type: requireText(organization.type, "organization.type", 64),
    },
    administrator: {
      account: administrator.account,
      displayName: administrator.displayName,
      mobilePhone: administrator.mobilePhone,
    },
    doctor: {
      account: doctor.account,
      displayName: doctor.displayName,
      mobilePhone: doctor.mobilePhone,
      title: doctor.title ?? "",
      department: doctor.department ?? "",
    },
  };
}

export function requireProductionBootstrapInput(
  environment: Record<string, string | undefined> = process.env,
  options: ProductionBootstrapSecretOptions = {},
): ProductionBootstrapInput {
  if (environment.NODE_ENV !== "production") {
    throw new Error("Production bootstrap requires NODE_ENV=production.");
  }
  for (const name of [
    "PRODUCTION_BOOTSTRAP_CONFIG",
    "PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD",
    "PRODUCTION_BOOTSTRAP_DOCTOR_PASSWORD",
  ]) {
    if (Object.prototype.hasOwnProperty.call(environment, name)) {
      throw new Error(`${name} must not be defined; use direct Secret Files.`);
    }
  }

  let configValue: unknown;
  try {
    configValue = JSON.parse(
      readDirectSecretFile(
        environment,
        "PRODUCTION_BOOTSTRAP_CONFIG_FILE",
        options,
      ),
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        "PRODUCTION_BOOTSTRAP_CONFIG_FILE must contain valid JSON.",
      );
    }
    throw error;
  }
  return {
    config: parseProductionBootstrapConfig(configValue),
    administratorPassword: validateCredentialPassword(
      readDirectSecretFile(
        environment,
        "PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD_FILE",
        options,
      ),
    ),
    doctorPassword: validateCredentialPassword(
      readDirectSecretFile(
        environment,
        "PRODUCTION_BOOTSTRAP_DOCTOR_PASSWORD_FILE",
        options,
      ),
    ),
    encryptionKey: requireSensitiveBackfillKey(environment, options),
  };
}

async function ensureRoleDefinition(
  transaction: BootstrapTransaction,
  role: { code: RoleCode; name: string; level: number },
) {
  const definition = await transaction.roleDefinition.upsert({
    where: { code: role.code },
    update: {},
    create: { ...role, isSystemRole: true },
  });
  if (
    definition.name !== role.name ||
    definition.level !== role.level ||
    !definition.isSystemRole
  ) {
    throw new Error(
      `Role definition ${role.code} does not match production bootstrap policy.`,
    );
  }
}

async function ensureProductionUser(
  transaction: BootstrapTransaction,
  input: ProductionBootstrapConfig["administrator"],
  passwordHash: string,
  encryptionKey: SensitiveEncryptionKey,
) {
  const existing = await transaction.user.findUnique({
    where: { account: input.account },
    select: {
      id: true,
      account: true,
      accountStatus: true,
      credentialVersion: true,
      identityEnvelope: true,
      mobilePhoneLookup: true,
    },
  });
  const mobilePhoneLookup = input.mobilePhone === null
    ? null
    : createPhoneLookupHmac(input.mobilePhone, encryptionKey.key);
  if (existing) {
    if (
      existing.accountStatus !== "active" ||
      existing.credentialVersion !== 1
    ) {
      throw new Error(
        `Existing production bootstrap account ${input.account} is not an active initialized account.`,
      );
    }
    const identity = decryptSensitiveJson<{ displayName?: unknown }>(
      existing.identityEnvelope,
      {
        tableName: "user",
        recordId: existing.id,
        fieldName: "identityEnvelope",
      },
      encryptionKey,
    );
    if (
      identity.displayName !== input.displayName ||
      existing.mobilePhoneLookup !== mobilePhoneLookup
    ) {
      throw new Error(
        `Existing production bootstrap account ${input.account} conflicts with the approved Secret File identity.`,
      );
    }
    return existing;
  }

  const id = randomUUID();
  return transaction.user.create({
    data: {
      id,
      account: input.account,
      identityEnvelope: encryptSensitiveJson(
        { displayName: input.displayName, mobilePhone: input.mobilePhone },
        { tableName: "user", recordId: id, fieldName: "identityEnvelope" },
        encryptionKey,
      ),
      mobilePhoneLookup,
      passwordHash,
      credentialVersion: 1,
      passwordResetRequired: true,
      passwordUpdatedAt: new Date(),
      accountStatus: "active",
    },
    select: {
      id: true,
      account: true,
      accountStatus: true,
      credentialVersion: true,
      identityEnvelope: true,
      mobilePhoneLookup: true,
    },
  });
}

async function ensureRoleBinding(
  transaction: BootstrapTransaction,
  input: {
    userId: string;
    organizationId?: string;
    roleCode: RoleCode;
    relatedObjectType: string;
    relatedObjectId: string;
  },
) {
  const binding = await transaction.userRoleBinding.upsert({
    where: {
      userId_roleCode_relatedObjectId: {
        userId: input.userId,
        roleCode: input.roleCode,
        relatedObjectId: input.relatedObjectId,
      },
    },
    update: {},
    create: { ...input, bindingStatus: "active" },
  });
  if (
    binding.bindingStatus !== "active" ||
    binding.organizationId !== (input.organizationId ?? null) ||
    binding.relatedObjectType !== input.relatedObjectType
  ) {
    throw new Error(
      `Production bootstrap role binding ${input.roleCode} conflicts with existing data.`,
    );
  }
}

export async function bootstrapProduction(
  prisma: PrismaClient,
  input: ProductionBootstrapInput,
) {
  const administratorPasswordHash = await hashCredential(
    input.administratorPassword,
  );
  const doctorPasswordHash = await hashCredential(input.doctorPassword);
  const configFingerprint = createHash("sha256")
    .update(JSON.stringify(input.config), "utf8")
    .digest("hex");

  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      PRODUCTION_BOOTSTRAP_LOCK,
    );
    for (const role of PRODUCTION_ROLE_DEFINITIONS) {
      await ensureRoleDefinition(transaction, role);
    }

    const organization = await transaction.organization.upsert({
      where: { code: input.config.organization.code },
      update: {},
      create: { ...input.config.organization, status: "active" },
    });
    if (
      organization.name !== input.config.organization.name ||
      organization.type !== input.config.organization.type ||
      organization.status !== "active"
    ) {
      throw new Error(
        "Existing production bootstrap organization conflicts with the approved Secret File.",
      );
    }

    const administrator = await ensureProductionUser(
      transaction,
      input.config.administrator,
      administratorPasswordHash,
      input.encryptionKey,
    );
    const doctorUser = await ensureProductionUser(
      transaction,
      input.config.doctor,
      doctorPasswordHash,
      input.encryptionKey,
    );
    const existingDoctor = await transaction.doctorProfile.findUnique({
      where: { userId: doctorUser.id },
    });
    const doctor =
      existingDoctor ??
      (await transaction.doctorProfile.create({
        data: {
          userId: doctorUser.id,
          organizationId: organization.id,
          title: input.config.doctor.title,
          department: input.config.doctor.department,
        },
      }));
    if (
      doctor.organizationId !== organization.id ||
      doctor.title !== input.config.doctor.title ||
      doctor.department !== input.config.doctor.department
    ) {
      throw new Error(
        "Existing production bootstrap doctor profile conflicts with the approved Secret File.",
      );
    }

    await ensureRoleBinding(transaction, {
      userId: administrator.id,
      roleCode: "admin_super",
      relatedObjectType: "admin",
      relatedObjectId: administrator.id,
    });
    await ensureRoleBinding(transaction, {
      userId: doctorUser.id,
      organizationId: organization.id,
      roleCode: "doctor",
      relatedObjectType: "doctor",
      relatedObjectId: doctor.id,
    });

    const existingAudit = await transaction.auditLog.findFirst({
      where: {
        action: "system.production_bootstrap",
        targetType: "organization",
        targetId: organization.id,
        result: "success",
      },
      select: { id: true },
    });
    if (!existingAudit) {
      await transaction.auditLog.create({
        data: {
          actorUserId: administrator.id,
          actorRole: "admin_super",
          action: "system.production_bootstrap",
          targetType: "organization",
          targetId: organization.id,
          result: "success",
          metadata: {
            configFingerprint,
            users: 2,
            patientRecordsCreated: 0,
            trainingRecordsCreated: 0,
          },
        },
      });
    }

    return {
      organizationId: organization.id,
      administratorAccount: administrator.account,
      doctorAccount: doctorUser.account,
    };
  });
}

export async function runProductionBootstrapCli(
  args: string[] = process.argv.slice(2),
  environment: Record<string, string | undefined> = process.env,
) {
  if (args.length > 0) {
    throw new Error(
      "Production bootstrap does not accept command-line arguments.",
    );
  }
  const prisma = new PrismaClient();
  try {
    const result = await bootstrapProduction(
      prisma,
      requireProductionBootstrapInput(environment),
    );
    console.log(
      `Production bootstrap completed for organization ${result.organizationId}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void runProductionBootstrapCli().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
