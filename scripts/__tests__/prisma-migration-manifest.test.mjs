import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";
import { verifyPrismaMigrationManifest } from "../verify-prisma-migration-manifest.mjs";

test("Prisma migration manifest matches every checked-in migration", () => {
  assert.deepEqual(verifyPrismaMigrationManifest().failures, []);
});

test("Prisma migration manifest rejects missing entries and changed SQL", () => {
  const directory = mkdtempSync(join(tmpdir(), "rehab-migration-manifest-"));
  const migrationsDirectory = join(directory, "migrations");
  mkdirSync(join(migrationsDirectory, "20260101000000_initial"), {
    recursive: true,
  });
  writeFileSync(
    join(migrationsDirectory, "20260101000000_initial", "migration.sql"),
    "CREATE TABLE example (id TEXT);\n",
    "utf8",
  );
  const manifestPath = join(directory, "manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({
      version: 1,
      migrations: [
        {
          name: "20260101000000_initial",
          sha256: createHash("sha256").update("different").digest("hex"),
        },
        {
          name: "20260102000000_missing",
          sha256: createHash("sha256").update("missing").digest("hex"),
        },
      ],
    }),
    "utf8",
  );

  const result = verifyPrismaMigrationManifest({
    migrationsDirectory,
    manifestPath,
  });
  assert.match(result.failures.join("\n"), /checksum/);
  assert.match(result.failures.join("\n"), /missing migration/);
});
