import { PrismaClient, RoleCode } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

const roleDefinitions: Array<{ code: RoleCode; name: string; level: number }> = [
  { code: "patient", name: "患者", level: 10 },
  { code: "caregiver", name: "家属", level: 20 },
  { code: "doctor", name: "医师", level: 30 },
  { code: "admin", name: "管理员", level: 40 },
  { code: "admin_super", name: "超级管理员", level: 43 },
  { code: "admin_operator", name: "普通运营", level: 41 },
  { code: "admin_auditor", name: "只读审计", level: 40 },
];

function hashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

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

function assertDifferentPasswords(adminPassword: string, doctorPassword: string) {
  if (adminPassword === doctorPassword) {
    throw new Error("TRIAL_ADMIN_INITIAL_PASSWORD and TRIAL_DOCTOR_INITIAL_PASSWORD must be different.");
  }
}

async function ensureRoleDefinitions() {
  await prisma.roleDefinition.createMany({
    data: roleDefinitions,
    skipDuplicates: true,
  });
}

async function main() {
  const organizationCode = requireText("TRIAL_ORG_CODE");
  const organizationName = requireText("TRIAL_ORG_NAME");
  const organizationType = requireText("TRIAL_ORG_TYPE");
  const adminAccount = requireText("TRIAL_ADMIN_ACCOUNT");
  const adminDisplayName = requireText("TRIAL_ADMIN_DISPLAY_NAME");
  const adminPassword = requireText("TRIAL_ADMIN_INITIAL_PASSWORD");
  const doctorAccount = requireText("TRIAL_DOCTOR_ACCOUNT");
  const doctorDisplayName = requireText("TRIAL_DOCTOR_DISPLAY_NAME");
  const doctorPassword = requireText("TRIAL_DOCTOR_INITIAL_PASSWORD");
  const doctorTitle = requireText("TRIAL_DOCTOR_TITLE");
  const doctorDepartment = requireText("TRIAL_DOCTOR_DEPARTMENT");

  assertDifferentPasswords(adminPassword, doctorPassword);
  await ensureRoleDefinitions();

  const organization = await prisma.organization.upsert({
    where: { code: organizationCode },
    update: {
      name: organizationName,
      type: organizationType,
      status: "active",
    },
    create: {
      code: organizationCode,
      name: organizationName,
      type: organizationType,
      status: "active",
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { account: adminAccount },
    update: {
      displayName: adminDisplayName,
      mobilePhone: optionalText("TRIAL_ADMIN_MOBILE_PHONE"),
      passwordHash: hashPassword(adminPassword),
      accountStatus: "active",
    },
    create: {
      account: adminAccount,
      displayName: adminDisplayName,
      mobilePhone: optionalText("TRIAL_ADMIN_MOBILE_PHONE"),
      passwordHash: hashPassword(adminPassword),
      accountStatus: "active",
    },
  });

  await prisma.userRoleBinding.upsert({
    where: {
      userId_roleCode_relatedObjectId: {
        userId: adminUser.id,
        roleCode: "admin_super",
        relatedObjectId: adminUser.id,
      },
    },
    update: {
      organizationId: organization.id,
      bindingStatus: "active",
      relatedObjectType: "admin",
    },
    create: {
      userId: adminUser.id,
      organizationId: organization.id,
      roleCode: "admin_super",
      relatedObjectType: "admin",
      relatedObjectId: adminUser.id,
      bindingStatus: "active",
    },
  });

  const doctorUser = await prisma.user.upsert({
    where: { account: doctorAccount },
    update: {
      displayName: doctorDisplayName,
      mobilePhone: optionalText("TRIAL_DOCTOR_MOBILE_PHONE"),
      passwordHash: hashPassword(doctorPassword),
      accountStatus: "active",
    },
    create: {
      account: doctorAccount,
      displayName: doctorDisplayName,
      mobilePhone: optionalText("TRIAL_DOCTOR_MOBILE_PHONE"),
      passwordHash: hashPassword(doctorPassword),
      accountStatus: "active",
    },
  });

  const doctor = await prisma.doctorProfile.upsert({
    where: { userId: doctorUser.id },
    update: {
      organizationId: organization.id,
      title: doctorTitle,
      department: doctorDepartment,
    },
    create: {
      userId: doctorUser.id,
      organizationId: organization.id,
      title: doctorTitle,
      department: doctorDepartment,
    },
  });

  await prisma.userRoleBinding.upsert({
    where: {
      userId_roleCode_relatedObjectId: {
        userId: doctorUser.id,
        roleCode: "doctor",
        relatedObjectId: doctor.id,
      },
    },
    update: {
      organizationId: organization.id,
      bindingStatus: "active",
      relatedObjectType: "doctor",
    },
    create: {
      userId: doctorUser.id,
      organizationId: organization.id,
      roleCode: "doctor",
      relatedObjectType: "doctor",
      relatedObjectId: doctor.id,
      bindingStatus: "active",
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
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
    ],
  });

  console.log("Trial initialization completed. Organization, admin account, and doctor account are ready.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
