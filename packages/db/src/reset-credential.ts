import { PrismaClient } from "@prisma/client";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  assertFirstAdminOnlyArgs,
  bootstrapFirstAdminCredential,
} from "./first-admin-bootstrap";
import { validateCredentialPassword } from "./credential-security";

const prisma = new PrismaClient();
const RENDER_SECRET_DIRECTORY = "/etc/secrets";

export type FirstAdminCredentialSecretOptions = {
  secretDirectory?: string;
};

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

function loadProductionResetPassword(
  environment: Record<string, string | undefined>,
  options: FirstAdminCredentialSecretOptions,
) {
  if (
    Object.prototype.hasOwnProperty.call(
      environment,
      "CREDENTIAL_RESET_PASSWORD",
    )
  ) {
    throw new Error(
      "CREDENTIAL_RESET_PASSWORD must not be defined in production; configure CREDENTIAL_RESET_PASSWORD_FILE instead.",
    );
  }
  const configuredPath = requireExactEnvironmentValue(
    environment,
    "CREDENTIAL_RESET_PASSWORD_FILE",
    "CREDENTIAL_RESET_PASSWORD_FILE must be an exact non-empty Secret File path in production.",
  );
  if (!isAbsolute(configuredPath)) {
    throw new Error(
      "CREDENTIAL_RESET_PASSWORD_FILE must be an absolute Secret File path.",
    );
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
    throw new Error(
      `CREDENTIAL_RESET_PASSWORD_FILE must point directly under ${secretDirectory}.`,
    );
  }

  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(resolvedPath);
  } catch {
    throw new Error(
      "CREDENTIAL_RESET_PASSWORD_FILE Secret File is unavailable.",
    );
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(
      "CREDENTIAL_RESET_PASSWORD_FILE must point to a regular file.",
    );
  }

  let password: string;
  try {
    password = readFileSync(resolvedPath, "utf8");
  } catch {
    throw new Error(
      "CREDENTIAL_RESET_PASSWORD_FILE Secret File cannot be read.",
    );
  }
  if (!password || password.trim() !== password) {
    throw new Error(
      "CREDENTIAL_RESET_PASSWORD_FILE Secret File must contain one exact non-empty password.",
    );
  }
  return password;
}

export function requireFirstAdminBootstrapPassword(
  environment: Record<string, string | undefined> = process.env,
  options: FirstAdminCredentialSecretOptions = {},
) {
  const password =
    environment.NODE_ENV === "production"
      ? loadProductionResetPassword(environment, options)
      : requireExactEnvironmentValue(
          environment,
          "CREDENTIAL_RESET_PASSWORD",
          "CREDENTIAL_RESET_PASSWORD is required outside production.",
        );
  return validateCredentialPassword(password);
}

export async function runFirstAdminCredentialResetCli(
  args: string[] = process.argv.slice(2),
  environment: Record<string, string | undefined> = process.env,
) {
  assertFirstAdminOnlyArgs(args);
  const target = await bootstrapFirstAdminCredential(
    prisma,
    requireFirstAdminBootstrapPassword(environment),
  );
  console.log(`Credential reset completed for account: ${target.account}`);
}

if (require.main === module) {
  void runFirstAdminCredentialResetCli()
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
