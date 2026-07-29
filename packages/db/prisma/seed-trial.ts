import { Prisma, PrismaClient, RoleCode } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { requireSensitiveBackfillKey } from "../src/backfill-sensitive-encryption";
import {
  hashCredential,
  validateCredentialPassword,
} from "../src/credential-security";
import {
  createPhoneLookupHmac,
  decryptSensitiveJson,
  encryptSensitiveJson,
  type SensitiveEncryptionKey,
} from "../src/sensitive-encryption";

const prisma = new PrismaClient();

const roleDefinitions: Array<{ code: RoleCode; name: string; level: number }> =
  [
    { code: "patient", name: "患者", level: 10 },
    { code: "caregiver", name: "家属", level: 20 },
    { code: "doctor", name: "医师", level: 30 },
    { code: "admin", name: "管理员", level: 40 },
    { code: "admin_super", name: "超级管理员", level: 43 },
    { code: "admin_operator", name: "普通运营", level: 41 },
    { code: "admin_auditor", name: "只读审计", level: 40 },
  ];

function requireText(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalText(name: string) {
  return process.env[name]?.trim() || undefined;
}

function requirePassword(name: string) {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return validateCredentialPassword(value);
}

function assertDifferentPasswords(
  adminPassword: string,
  doctorPassword: string,
) {
  if (adminPassword === doctorPassword) {
    throw new Error(
      "TRIAL_ADMIN_INITIAL_PASSWORD and TRIAL_DOCTOR_INITIAL_PASSWORD must be different.",
    );
  }
}

export function trialEnvelope(
  value: Prisma.JsonObject,
  recordId: string,
  encryptionKey: SensitiveEncryptionKey,
): Prisma.InputJsonValue {
  const envelope = encryptSensitiveJson(
    value,
    { tableName: "user", recordId, fieldName: "identityEnvelope" },
    encryptionKey,
  );
  return { ...envelope, aad: { ...envelope.aad } };
}

async function ensureRoleDefinitions() {
  await prisma.roleDefinition.createMany({
    data: roleDefinitions,
    skipDuplicates: true,
  });
}

async function preflightExistingTrialEnvelopes(
  accounts: string[],
  encryptionKey: SensitiveEncryptionKey,
) {
  const users = await prisma.user.findMany({
    where: { account: { in: accounts } },
    select: { id: true, identityEnvelope: true },
  });
  for (const user of users) {
    decryptSensitiveJson(
      user.identityEnvelope,
      { tableName: "user", recordId: user.id, fieldName: "identityEnvelope" },
      encryptionKey,
    );
  }
}

async function main() {
  const encryptionKey = requireSensitiveBackfillKey(process.env);
  const organizationCode = requireText("TRIAL_ORG_CODE");
  const organizationName = requireText("TRIAL_ORG_NAME");
  const organizationType = requireText("TRIAL_ORG_TYPE");
  const adminAccount = requireText("TRIAL_ADMIN_ACCOUNT");
  const adminDisplayName = requireText("TRIAL_ADMIN_DISPLAY_NAME");
  const adminPassword = requirePassword("TRIAL_ADMIN_INITIAL_PASSWORD");
  const doctorAccount = requireText("TRIAL_DOCTOR_ACCOUNT");
  const doctorDisplayName = requireText("TRIAL_DOCTOR_DISPLAY_NAME");
  const doctorPassword = requirePassword("TRIAL_DOCTOR_INITIAL_PASSWORD");
  const doctorTitle = requireText("TRIAL_DOCTOR_TITLE");
  const doctorDepartment = requireText("TRIAL_DOCTOR_DEPARTMENT");
  const adminMobilePhone = optionalText("TRIAL_ADMIN_MOBILE_PHONE") ?? null;
  const doctorMobilePhone = optionalText("TRIAL_DOCTOR_MOBILE_PHONE") ?? null;
  const adminUserId = randomUUID();
  const doctorUserId = randomUUID();
  const adminIdentityEnvelope = trialEnvelope(
    { displayName: adminDisplayName, mobilePhone: adminMobilePhone },
    adminUserId,
    encryptionKey,
  );
  const adminMobilePhoneLookup = adminMobilePhone
    ? createPhoneLookupHmac(adminMobilePhone, encryptionKey.key)
    : null;
  const doctorIdentityEnvelope = trialEnvelope(
    { displayName: doctorDisplayName, mobilePhone: doctorMobilePhone },
    doctorUserId,
    encryptionKey,
  );
  const doctorMobilePhoneLookup = doctorMobilePhone
    ? createPhoneLookupHmac(doctorMobilePhone, encryptionKey.key)
    : null;

  assertDifferentPasswords(adminPassword, doctorPassword);
  await preflightExistingTrialEnvelopes(
    [adminAccount, doctorAccount],
    encryptionKey,
  );
  const [adminPasswordHash, doctorPasswordHash] = await Promise.all([
    hashCredential(adminPassword),
    hashCredential(doctorPassword),
  ]);
  await ensureRoleDefinitions();

  await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        code: organizationCode,
        name: organizationName,
        type: organizationType,
        status: "active",
      },
    });

    const adminUser = await tx.user.create({
      data: {
        id: adminUserId,
        account: adminAccount,
        identityEnvelope: adminIdentityEnvelope,
        mobilePhoneLookup: adminMobilePhoneLookup,
        passwordHash: adminPasswordHash,
        passwordUpdatedAt: new Date(),
        passwordResetRequired: true,
        accountStatus: "active",
      },
    });

    await tx.userRoleBinding.create({
      data: {
        userId: adminUser.id,
        organizationId: organization.id,
        roleCode: "admin_super",
        relatedObjectType: "admin",
        relatedObjectId: adminUser.id,
        bindingStatus: "active",
      },
    });

    const doctorUser = await tx.user.create({
      data: {
        id: doctorUserId,
        account: doctorAccount,
        identityEnvelope: doctorIdentityEnvelope,
        mobilePhoneLookup: doctorMobilePhoneLookup,
        passwordHash: doctorPasswordHash,
        passwordUpdatedAt: new Date(),
        passwordResetRequired: true,
        accountStatus: "active",
      },
    });

    const doctor = await tx.doctorProfile.create({
      data: {
        userId: doctorUser.id,
        organizationId: organization.id,
        title: doctorTitle,
        department: doctorDepartment,
      },
    });

    await tx.userRoleBinding.create({
      data: {
        userId: doctorUser.id,
        organizationId: organization.id,
        roleCode: "doctor",
        relatedObjectType: "doctor",
        relatedObjectId: doctor.id,
        bindingStatus: "active",
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: adminUser.id,
        actorRole: "admin_super",
        action: "trial.initialize",
        targetType: "organization",
        targetId: organization.id,
        result: "success",
        metadata: {
          organizationCode,
          initializedAccounts: [adminAccount, doctorAccount],
        },
      },
    });
  });

  console.log(
    "Trial initialization completed. Organization, admin account, and doctor account are ready.",
  );
}

if (require.main === module) {
  void main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
