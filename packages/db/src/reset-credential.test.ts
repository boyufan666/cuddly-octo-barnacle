import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { requireFirstAdminBootstrapPassword } from "./reset-credential";

test("first-admin credential reset uses the local password only outside production", () => {
  assert.equal(
    requireFirstAdminBootstrapPassword({
      CREDENTIAL_RESET_PASSWORD: "Local-Admin-Password-253913!",
    }),
    "Local-Admin-Password-253913!",
  );
  assert.throws(
    () => requireFirstAdminBootstrapPassword({}),
    /CREDENTIAL_RESET_PASSWORD is required outside production/,
  );
});

test("production first-admin credential reset reads only one direct Secret File", () => {
  const secretDirectory = mkdtempSync(resolve(tmpdir(), "rehab-admin-reset-"));
  const secretFile = resolve(secretDirectory, "first_admin_password");
  const password = "Production-Admin-Password-253913!";
  writeFileSync(secretFile, password, "utf8");

  try {
    assert.equal(
      requireFirstAdminBootstrapPassword(
        {
          NODE_ENV: "production",
          CREDENTIAL_RESET_PASSWORD_FILE: secretFile,
        },
        { secretDirectory },
      ),
      password,
    );
    assert.throws(
      () =>
        requireFirstAdminBootstrapPassword(
          {
            NODE_ENV: "production",
            CREDENTIAL_RESET_PASSWORD_FILE: secretFile,
            CREDENTIAL_RESET_PASSWORD: password,
          },
          { secretDirectory },
        ),
      /must not be defined in production/i,
    );
    assert.throws(
      () =>
        requireFirstAdminBootstrapPassword(
          {
            NODE_ENV: "production",
            CREDENTIAL_RESET_PASSWORD_FILE: resolve(
              secretDirectory,
              "nested",
              "password",
            ),
          },
          { secretDirectory },
        ),
      /directly under/i,
    );

    const symlinkPath = resolve(secretDirectory, "first_admin_password_link");
    symlinkSync(secretFile, symlinkPath);
    assert.throws(
      () =>
        requireFirstAdminBootstrapPassword(
          {
            NODE_ENV: "production",
            CREDENTIAL_RESET_PASSWORD_FILE: symlinkPath,
          },
          { secretDirectory },
        ),
      /regular file/i,
    );
    writeFileSync(secretFile, `${password}\n`, "utf8");
    assert.throws(
      () =>
        requireFirstAdminBootstrapPassword(
          {
            NODE_ENV: "production",
            CREDENTIAL_RESET_PASSWORD_FILE: secretFile,
          },
          { secretDirectory },
        ),
      /one exact non-empty password/i,
    );
  } finally {
    rmSync(secretDirectory, { recursive: true, force: true });
  }
});
