import type { PrismaClient } from "@prisma/client";
import {
  hashCredential,
  validateCredentialPassword,
} from "./credential-security";

export function assertFirstAdminOnlyArgs(args: string[]) {
  if (args.length > 0) {
    throw new Error(
      "First-admin bootstrap does not accept account targeting or other arguments.",
    );
  }
}

export function findFirstActiveAdmin(prisma: Pick<PrismaClient, "user">) {
  return prisma.user.findFirst({
    where: {
      accountStatus: "active",
      credentialVersion: 0,
      passwordResetRequired: true,
      roleBindings: {
        some: {
          roleCode: { in: ["admin_super", "admin"] },
          bindingStatus: "active",
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { account: "asc" }],
    select: {
      id: true,
      account: true,
      credentialVersion: true,
      passwordResetRequired: true,
      authSessionVersion: true,
    },
  });
}

export async function bootstrapFirstAdminCredential(
  prisma: PrismaClient,
  password: string,
) {
  const validatedPassword = validateCredentialPassword(password);
  const passwordHash = await hashCredential(validatedPassword);
  return prisma.$transaction(async (tx) => {
    const target = await findFirstActiveAdmin(tx);
    if (!target) {
      throw new Error(
        "No active administrator with an active admin binding was found.",
      );
    }
    const updated = await tx.user.updateMany({
      where: {
        id: target.id,
        account: target.account,
        accountStatus: "active",
        credentialVersion: target.credentialVersion,
        passwordResetRequired: target.passwordResetRequired,
        authSessionVersion: target.authSessionVersion,
        roleBindings: {
          some: {
            roleCode: { in: ["admin_super", "admin"] },
            bindingStatus: "active",
          },
        },
      },
      data: {
        passwordHash,
        credentialVersion: 1,
        passwordResetRequired: true,
        passwordUpdatedAt: new Date(),
        authSessionVersion: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new Error(
        "First-admin bootstrap target changed or a concurrent bootstrap already updated it.",
      );
    }
    await tx.auditLog.create({
      data: {
        action: "auth.password.first_admin_bootstrap",
        targetType: "user",
        targetId: target.id,
        result: "success",
        metadata: {
          source: "controlled_first_admin_bootstrap",
          passwordResetRequired: true,
        },
      },
    });
    return { id: target.id, account: target.account };
  });
}
