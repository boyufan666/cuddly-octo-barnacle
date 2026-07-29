import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const databasePackageDirectory = resolve(repositoryRoot, "packages/db");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

test("database workspace builds a Node-loadable runtime package", () => {
  const databasePackage = JSON.parse(
    readFileSync(resolve(databasePackageDirectory, "package.json"), "utf8"),
  );
  const apiPackage = JSON.parse(
    readFileSync(resolve(repositoryRoot, "apps/api/package.json"), "utf8"),
  );

  assert.equal(databasePackage.main, "dist/index.js");
  assert.equal(databasePackage.types, "dist/index.d.ts");
  assert.equal(databasePackage.scripts.build, "tsc -p tsconfig.build.json");
  assert.equal(
    apiPackage.scripts.build,
    "pnpm --filter @rehab-platform/db build && nest build",
  );

  run("pnpm", ["--filter", "@rehab-platform/db", "build"]);
  const loaded = run(process.execPath, [
    "-e",
    `const shared = require(${JSON.stringify(databasePackageDirectory)});` +
      `for (const name of ["encryptSensitiveJson", "decryptSensitiveJson", "hashCredential", "verifyCredential"]) {` +
      `if (typeof shared[name] !== "function") throw new Error("missing runtime export: " + name);` +
      `}`,
  ]);
  assert.equal(loaded.stdout, "");
  assert.equal(loaded.stderr, "");
});
