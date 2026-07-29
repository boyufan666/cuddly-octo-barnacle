import assert from "node:assert/strict";
import test from "node:test";
import {
  assertFirstAdminOnlyArgs,
  bootstrapFirstAdminCredential,
  findFirstActiveAdmin,
} from "./first-admin-bootstrap";
import {
  ARGON2ID_PARAMETERS,
  validateCredentialPassword,
  verifyCredential,
} from "./credential-security";

test("database credential tooling shares the 8..128 no-trim password policy", () => {
  assert.equal(validateCredentialPassword(" padded "), " padded ");
  assert.throws(() => validateCredentialPassword("1234567"), /8.*128/);
  assert.throws(
    () => validateCredentialPassword(12345678),
    /must be a string/i,
  );
  assert.deepEqual(ARGON2ID_PARAMETERS, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
});

test("first-admin bootstrap rejects arbitrary account targeting", () => {
  assert.throws(
    () => assertFirstAdminOnlyArgs(["--account", "patient001"]),
    /does not accept account targeting/i,
  );
});

test("first-admin bootstrap hard-fails without writing when no active admin exists", async () => {
  let transactionCalls = 0;
  const prisma = {
    user: {
      findFirst: async () => {
        throw new Error("selection must stay inside the transaction");
      },
    },
    $transaction: async (
      callback: (value: {
        user: { findFirst: () => Promise<null> };
      }) => Promise<unknown>,
    ) => {
      transactionCalls += 1;
      return callback({ user: { findFirst: async () => null } });
    },
  };

  await assert.rejects(
    bootstrapFirstAdminCredential(prisma as never, "Strong-Password-253913!"),
    /No active administrator with an active admin binding/,
  );
  assert.equal(transactionCalls, 1);
});

test("first-admin bootstrap selects only active accounts with active admin bindings", async () => {
  let query: unknown;
  const prisma = {
    user: {
      findFirst: async (value: unknown) => {
        query = value;
        return { id: "admin-id", account: "admin" };
      },
    },
  };

  await findFirstActiveAdmin(prisma as never);

  assert.deepEqual(query, {
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
});

test("first-admin bootstrap writes the final Argon2id credential and audit in one transaction", async () => {
  let transactionCalls = 0;
  let updateInput: unknown;
  let auditInput: unknown;
  const tx = {
    user: {
      findFirst: async () => ({
        id: "admin-id",
        account: "admin",
        credentialVersion: 0,
        passwordResetRequired: true,
        authSessionVersion: 3,
      }),
      updateMany: async (input: unknown) => {
        updateInput = input;
        return { count: 1 };
      },
    },
    auditLog: {
      create: async (input: unknown) => {
        auditInput = input;
        return { id: "audit-id" };
      },
    },
  };
  const prisma = {
    user: {
      findFirst: async () => {
        throw new Error("selection must stay inside the transaction");
      },
    },
    $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => {
      transactionCalls += 1;
      return callback(tx);
    },
  };

  const result = await bootstrapFirstAdminCredential(
    prisma as never,
    "Final-Admin-Password-253913!",
  );

  assert.deepEqual(result, { id: "admin-id", account: "admin" });
  assert.equal(transactionCalls, 1);
  const update = updateInput as {
    where: {
      id: string;
      account: string;
      accountStatus: string;
      credentialVersion: number;
      passwordResetRequired: boolean;
      authSessionVersion: number;
      roleBindings: {
        some: { roleCode: { in: string[] }; bindingStatus: string };
      };
    };
    data: {
      passwordHash: string;
      credentialVersion: number;
      passwordResetRequired: boolean;
      passwordUpdatedAt: Date;
      authSessionVersion: { increment: number };
    };
  };
  assert.equal(update.where.id, "admin-id");
  assert.equal(update.where.account, "admin");
  assert.equal(update.where.accountStatus, "active");
  assert.equal(update.where.credentialVersion, 0);
  assert.equal(update.where.passwordResetRequired, true);
  assert.equal(update.where.authSessionVersion, 3);
  assert.deepEqual(update.where.roleBindings, {
    some: {
      roleCode: { in: ["admin_super", "admin"] },
      bindingStatus: "active",
    },
  });
  assert.match(
    update.data.passwordHash,
    /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/,
  );
  assert.equal(
    await verifyCredential(
      update.data.passwordHash,
      "Final-Admin-Password-253913!",
    ),
    true,
  );
  assert.equal(update.data.credentialVersion, 1);
  assert.equal(update.data.passwordResetRequired, true);
  assert.ok(update.data.passwordUpdatedAt instanceof Date);
  assert.deepEqual(update.data.authSessionVersion, { increment: 1 });
  assert.deepEqual(auditInput, {
    data: {
      action: "auth.password.first_admin_bootstrap",
      targetType: "user",
      targetId: "admin-id",
      result: "success",
      metadata: {
        source: "controlled_first_admin_bootstrap",
        passwordResetRequired: true,
      },
    },
  });
});

test("first-admin bootstrap rolls back password state when audit creation fails", async () => {
  const originalState = {
    passwordHash: "legacy-hash",
    credentialVersion: 0,
    passwordResetRequired: true,
    passwordUpdatedAt: null as Date | null,
    authSessionVersion: 4,
  };
  let persistedState = { ...originalState };
  let auditAttempts = 0;
  const prisma = {
    user: {
      findFirst: async () => {
        throw new Error("selection must stay inside the transaction");
      },
    },
    $transaction: async (
      callback: (value: {
        user: {
          findFirst: () => Promise<{
            id: string;
            account: string;
            authSessionVersion: number;
          }>;
          updateMany: (input: unknown) => Promise<{ count: number }>;
        };
        auditLog: { create: () => Promise<never> };
      }) => Promise<unknown>,
    ) => {
      const pendingState = { ...persistedState };
      const tx = {
        user: {
          findFirst: async () => ({
            id: "admin-id",
            account: "admin",
            credentialVersion: 0,
            passwordResetRequired: true,
            authSessionVersion: pendingState.authSessionVersion,
          }),
          updateMany: async (input: unknown) => {
            const update = input as {
              data: {
                passwordHash: string;
                credentialVersion: number;
                passwordResetRequired: boolean;
                passwordUpdatedAt: Date;
                authSessionVersion: { increment: number };
              };
            };
            Object.assign(pendingState, update.data, {
              authSessionVersion:
                pendingState.authSessionVersion +
                update.data.authSessionVersion.increment,
            });
            return { count: 1 };
          },
        },
        auditLog: {
          create: async () => {
            auditAttempts += 1;
            throw new Error("audit unavailable");
          },
        },
      };
      const result = await callback(tx);
      persistedState = pendingState;
      return result;
    },
  };

  await assert.rejects(
    bootstrapFirstAdminCredential(
      prisma as never,
      "Final-Admin-Password-253913!",
    ),
    /audit unavailable/,
  );

  assert.equal(auditAttempts, 1);
  assert.deepEqual(persistedState, originalState);
});

test("first-admin bootstrap lets exactly one concurrent caller update and audit", async () => {
  const passwords = [
    "Concurrent-Admin-Password-A-253913!",
    "Concurrent-Admin-Password-B-253913!",
  ] as const;
  const state = {
    id: "admin-id",
    account: "admin",
    accountStatus: "active",
    bindingStatus: "active",
    roleCode: "admin_super",
    passwordHash: "legacy-hash",
    credentialVersion: 0,
    passwordResetRequired: true,
    passwordUpdatedAt: null as Date | null,
    authSessionVersion: 4,
  };
  let releaseSelections!: () => void;
  const bothSelected = new Promise<void>((resolve) => {
    releaseSelections = resolve;
  });
  let selectionCount = 0;
  let outsideSelectionCount = 0;
  let transactionSelectionCount = 0;
  let credentialWrites = 0;
  let auditWrites = 0;

  const selectTarget = async (insideTransaction: boolean) => {
    if (insideTransaction) {
      transactionSelectionCount += 1;
    } else {
      outsideSelectionCount += 1;
    }
    const selected = {
      id: state.id,
      account: state.account,
      credentialVersion: state.credentialVersion,
      passwordResetRequired: state.passwordResetRequired,
      authSessionVersion: state.authSessionVersion,
    };
    selectionCount += 1;
    if (selectionCount === passwords.length) {
      releaseSelections();
    }
    await bothSelected;
    return selected;
  };

  const applyCredentialUpdate = (input: unknown) => {
    const update = input as {
      data: {
        passwordHash: string;
        credentialVersion: number;
        passwordResetRequired: boolean;
        passwordUpdatedAt: Date;
        authSessionVersion: { increment: number };
      };
    };
    credentialWrites += 1;
    Object.assign(state, update.data, {
      authSessionVersion:
        state.authSessionVersion + update.data.authSessionVersion.increment,
    });
  };

  const tx = {
    user: {
      findFirst: async () => selectTarget(true),
      update: async (input: unknown) => {
        applyCredentialUpdate(input);
        return { id: state.id };
      },
      updateMany: async (input: unknown) => {
        const update = input as {
          where: {
            id: string;
            account: string;
            accountStatus: string;
            credentialVersion: number;
            passwordResetRequired: boolean;
            authSessionVersion: number;
            roleBindings: {
              some: { roleCode: { in: string[] }; bindingStatus: string };
            };
          };
        };
        const matches =
          update.where.id === state.id &&
          update.where.account === state.account &&
          update.where.accountStatus === state.accountStatus &&
          update.where.credentialVersion === state.credentialVersion &&
          update.where.passwordResetRequired === state.passwordResetRequired &&
          update.where.authSessionVersion === state.authSessionVersion &&
          update.where.roleBindings.some.roleCode.in.includes(state.roleCode) &&
          update.where.roleBindings.some.bindingStatus === state.bindingStatus;
        if (!matches) return { count: 0 };
        applyCredentialUpdate(input);
        return { count: 1 };
      },
    },
    auditLog: {
      create: async () => {
        auditWrites += 1;
        return { id: `audit-${auditWrites}` };
      },
    },
  };
  const prisma = {
    user: { findFirst: async () => selectTarget(false) },
    $transaction: async (callback: (value: typeof tx) => Promise<unknown>) =>
      callback(tx),
  };

  const settled = await Promise.allSettled(
    passwords.map((password) =>
      bootstrapFirstAdminCredential(prisma as never, password),
    ),
  );
  const passwordMatches = await Promise.all(
    passwords.map((password) => verifyCredential(state.passwordHash, password)),
  );
  const matchedPasswordIndex = passwordMatches.findIndex(Boolean);
  const rejected = settled.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  assert.deepEqual(
    {
      fulfilled: settled.filter((result) => result.status === "fulfilled")
        .length,
      rejected: settled.filter((result) => result.status === "rejected").length,
      outsideSelectionCount,
      transactionSelectionCount,
      credentialWrites,
      auditWrites,
      finalPasswordSourceCount: passwordMatches.filter(Boolean).length,
      finalPasswordBelongsToWinner:
        matchedPasswordIndex >= 0 &&
        settled[matchedPasswordIndex]?.status === "fulfilled",
      loserFailedClearly:
        rejected !== undefined &&
        /changed|concurrent|conflict/i.test(String(rejected.reason)),
    },
    {
      fulfilled: 1,
      rejected: 1,
      outsideSelectionCount: 0,
      transactionSelectionCount: 2,
      credentialWrites: 1,
      auditWrites: 1,
      finalPasswordSourceCount: 1,
      finalPasswordBelongsToWinner: true,
      loserFailedClearly: true,
    },
  );
});

for (const targetChange of [
  {
    name: "account becomes disabled",
    mutate: (state: {
      accountStatus: string;
      bindingStatus: string;
      credentialVersion: number;
      passwordResetRequired: boolean;
    }) => {
      state.accountStatus = "disabled";
    },
  },
  {
    name: "administrator binding becomes inactive",
    mutate: (state: {
      accountStatus: string;
      bindingStatus: string;
      credentialVersion: number;
      passwordResetRequired: boolean;
    }) => {
      state.bindingStatus = "inactive";
    },
  },
  {
    name: "administrator credential is already initialized",
    mutate: (state: {
      accountStatus: string;
      bindingStatus: string;
      credentialVersion: number;
      passwordResetRequired: boolean;
    }) => {
      state.credentialVersion = 1;
    },
  },
  {
    name: "administrator password reset is no longer required",
    mutate: (state: {
      accountStatus: string;
      bindingStatus: string;
      credentialVersion: number;
      passwordResetRequired: boolean;
    }) => {
      state.passwordResetRequired = false;
    },
  },
]) {
  test(`first-admin bootstrap rejects when the selected ${targetChange.name}`, async () => {
    const state = {
      id: "admin-id",
      account: "admin",
      accountStatus: "active",
      bindingStatus: "active",
      roleCode: "admin_super",
      credentialVersion: 0,
      passwordResetRequired: true,
      authSessionVersion: 4,
    };
    let selected = false;
    let credentialWrites = 0;
    let auditWrites = 0;
    const selectTarget = async () => {
      const target = {
        id: state.id,
        account: state.account,
        credentialVersion: state.credentialVersion,
        passwordResetRequired: state.passwordResetRequired,
        authSessionVersion: state.authSessionVersion,
      };
      if (!selected) {
        selected = true;
        targetChange.mutate(state);
      }
      return target;
    };
    const tx = {
      user: {
        findFirst: selectTarget,
        update: async () => {
          credentialWrites += 1;
          return { id: state.id };
        },
        updateMany: async (input: unknown) => {
          const update = input as {
            where: {
              accountStatus: string;
              credentialVersion: number;
              passwordResetRequired: boolean;
              authSessionVersion: number;
              roleBindings: {
                some: { roleCode: { in: string[] }; bindingStatus: string };
              };
            };
          };
          const matches =
            update.where.accountStatus === state.accountStatus &&
            update.where.credentialVersion === state.credentialVersion &&
            update.where.passwordResetRequired ===
              state.passwordResetRequired &&
            update.where.authSessionVersion === state.authSessionVersion &&
            update.where.roleBindings.some.roleCode.in.includes(
              state.roleCode,
            ) &&
            update.where.roleBindings.some.bindingStatus ===
              state.bindingStatus;
          if (!matches) return { count: 0 };
          credentialWrites += 1;
          return { count: 1 };
        },
      },
      auditLog: {
        create: async () => {
          auditWrites += 1;
          return { id: "audit-id" };
        },
      },
    };
    const prisma = {
      user: { findFirst: selectTarget },
      $transaction: async (callback: (value: typeof tx) => Promise<unknown>) =>
        callback(tx),
    };

    await assert.rejects(
      bootstrapFirstAdminCredential(
        prisma as never,
        "Changed-Target-Password-253913!",
      ),
      /changed|concurrent|conflict/i,
    );
    assert.equal(credentialWrites, 0);
    assert.equal(auditWrites, 0);
  });
}
