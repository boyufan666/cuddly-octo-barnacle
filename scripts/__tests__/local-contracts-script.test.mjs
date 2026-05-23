import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  requiredLocalContractChecks,
  verifyCompletedContractChecks,
} from "../local-contract-checks.mjs";

const scriptPath = resolve(
  import.meta.dirname,
  "../verify-local-contracts.mjs",
);

test("local contract verifier covers the training result review workflow", () => {
  const source = readFileSync(scriptPath, "utf8");

  assert.match(source, /const doctorAccount = "doctor001"/);
  assert.match(source, /PATCH/);
  assert.match(source, /\/training-results\/\$\{[^}]+\.id\}\/review/);
  assert.match(source, /training_result\.review/);
  assert.match(source, /reviewStatus === "reviewed"/);
  assert.match(source, /qualityFlag === "suspicious"/);
  assert.match(source, /abnormalFlag === true/);
  assert.match(source, /正常训练结果.*expectedStatus:\s*400/s);
  assert.match(source, /重复复核.*expectedStatus:\s*400/s);
});

test("local contract checklist requires every runtime review gate", () => {
  assert.deepEqual(
    verifyCompletedContractChecks(new Set(requiredLocalContractChecks)),
    [],
  );

  const incompleteChecks = new Set(requiredLocalContractChecks);
  incompleteChecks.delete("review_audit_log_persisted");

  assert.deepEqual(verifyCompletedContractChecks(incompleteChecks), [
    "review_audit_log_persisted",
  ]);
});
