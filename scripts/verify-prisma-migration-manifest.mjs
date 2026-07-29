#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const defaultMigrationsDirectory = resolve(
  repositoryRoot,
  "packages/db/prisma/migrations",
);
const defaultManifestPath = resolve(
  repositoryRoot,
  "packages/db/prisma/migration-manifest.json",
);
const migrationNamePattern = /^\d{14}_[a-z0-9_]+$/;
const checksumPattern = /^[a-f0-9]{64}$/;

export function verifyPrismaMigrationManifest({
  migrationsDirectory = defaultMigrationsDirectory,
  manifestPath = defaultManifestPath,
} = {}) {
  const failures = [];
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return { failures: ["Prisma migration manifest is missing or invalid JSON."] };
  }

  if (manifest?.version !== 1 || !Array.isArray(manifest.migrations)) {
    return { failures: ["Prisma migration manifest must use version 1 with migrations."] };
  }

  const expected = new Map();
  for (const entry of manifest.migrations) {
    if (
      !entry ||
      typeof entry.name !== "string" ||
      !migrationNamePattern.test(entry.name) ||
      typeof entry.sha256 !== "string" ||
      !checksumPattern.test(entry.sha256) ||
      expected.has(entry.name)
    ) {
      failures.push("Prisma migration manifest contains an invalid or duplicate entry.");
      continue;
    }
    expected.set(entry.name, entry.sha256);
  }

  let actualEntries;
  try {
    actualEntries = readdirSync(migrationsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && migrationNamePattern.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return { failures: [...failures, "Prisma migrations directory is unavailable."] };
  }

  for (const name of actualEntries) {
    const expectedChecksum = expected.get(name);
    if (!expectedChecksum) {
      failures.push(`Prisma migration ${name} is missing from the manifest.`);
      continue;
    }
    const migrationPath = resolve(migrationsDirectory, name, "migration.sql");
    if (!existsSync(migrationPath)) {
      failures.push(`Prisma migration ${name} has no migration.sql file.`);
      continue;
    }
    const actualChecksum = createHash("sha256")
      .update(readFileSync(migrationPath))
      .digest("hex");
    if (actualChecksum !== expectedChecksum) {
      failures.push(`Prisma migration ${name} checksum does not match the manifest.`);
    }
  }
  for (const name of expected.keys()) {
    if (!actualEntries.includes(name)) {
      failures.push(`Prisma migration manifest references missing migration ${name}.`);
    }
  }

  return { failures, migrationCount: actualEntries.length };
}

function cli() {
  const result = verifyPrismaMigrationManifest();
  if (result.failures.length > 0) {
    console.error("Prisma migration manifest verification failed:");
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Prisma migration manifest verified (${result.migrationCount} migrations).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}
