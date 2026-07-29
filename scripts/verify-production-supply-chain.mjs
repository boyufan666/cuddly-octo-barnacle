#!/usr/bin/env node

import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultOutputDirectory,
  produceProductionSupplyChain,
  repositoryRoot,
  SupplyChainMetadataError,
} from "./produce-production-supply-chain.mjs";

export const defaultLicensePolicyPath = resolve(
  repositoryRoot,
  "docs/customer-approved-license-policy.json",
);

const licensePolicySchema = "rehab-platform/customer-license-policy/v1";

export class SupplyChainPolicyError extends Error {}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireExactString(value, label) {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new SupplyChainPolicyError(
      `${label} must be an exact non-empty string.`,
    );
  }
  return value;
}

function requireCanonicalIsoTimestamp(value, label) {
  const timestamp = requireExactString(value, label);
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== timestamp) {
    throw new SupplyChainPolicyError(
      `${label} must be a canonical ISO-8601 UTC timestamp.`,
    );
  }
  return timestamp;
}

function readApprovedPolicy(path) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    throw new SupplyChainPolicyError(
      `Customer-approved license policy is required at ${path}; the template is not a policy approval.`,
    );
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new SupplyChainPolicyError(
      "Customer-approved license policy must be a regular file.",
    );
  }
  let policy;
  try {
    policy = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new SupplyChainPolicyError(
      "Customer-approved license policy must contain valid JSON.",
    );
  }
  if (!isRecord(policy)) {
    throw new SupplyChainPolicyError(
      "Customer-approved license policy must be a JSON object.",
    );
  }
  const allowedKeys = new Set([
    "schema",
    "policyVersion",
    "status",
    "lockfileSha256",
    "approvedBy",
    "approvedAt",
    "allowedLicenseExpressions",
  ]);
  for (const key of Object.keys(policy)) {
    if (!allowedKeys.has(key)) {
      throw new SupplyChainPolicyError(
        `Customer-approved license policy contains unsupported key ${JSON.stringify(key)}; waivers and component exceptions are not accepted.`,
      );
    }
  }
  if (policy.schema !== licensePolicySchema || policy.policyVersion !== 1) {
    throw new SupplyChainPolicyError(
      "Customer-approved license policy schema/version is invalid.",
    );
  }
  if (policy.status !== "approved") {
    throw new SupplyChainPolicyError(
      "Customer-approved license policy status must be approved.",
    );
  }
  requireExactString(
    policy.lockfileSha256,
    "Customer-approved license policy lockfileSha256",
  );
  requireExactString(
    policy.approvedBy,
    "Customer-approved license policy approvedBy",
  );
  requireCanonicalIsoTimestamp(
    policy.approvedAt,
    "Customer-approved license policy approvedAt",
  );
  if (
    !Array.isArray(policy.allowedLicenseExpressions) ||
    policy.allowedLicenseExpressions.length === 0
  ) {
    throw new SupplyChainPolicyError(
      "Customer-approved license policy must contain a non-empty allowedLicenseExpressions array.",
    );
  }
  const allowedLicenseExpressions = new Set();
  for (const [index, value] of policy.allowedLicenseExpressions.entries()) {
    const expression = requireExactString(
      value,
      `Customer-approved license policy allowedLicenseExpressions[${index}]`,
    );
    if (allowedLicenseExpressions.has(expression)) {
      throw new SupplyChainPolicyError(
        "Customer-approved license policy must not contain duplicate allowedLicenseExpressions.",
      );
    }
    allowedLicenseExpressions.add(expression);
  }
  return { ...policy, allowedLicenseExpressions };
}

export function verifyProductionSupplyChain({
  outputDirectory = defaultOutputDirectory,
  licensePolicyPath = defaultLicensePolicyPath,
  rootDir = repositoryRoot,
  tree,
  run,
} = {}) {
  const result = produceProductionSupplyChain({
    outputDirectory,
    rootDir,
    tree,
    ...(run ? { run } : {}),
  });
  const policy = readApprovedPolicy(licensePolicyPath);
  if (policy.lockfileSha256 !== result.environment.lockfileSha256) {
    throw new SupplyChainPolicyError(
      "Customer-approved license policy lockfileSha256 does not match the generated SBOM lockfile hash.",
    );
  }
  const unapproved = result.components.filter(
    (component) => !policy.allowedLicenseExpressions.has(component.license),
  );
  if (unapproved.length > 0) {
    throw new SupplyChainPolicyError(
      `Customer-approved license policy does not allow ${unapproved.length} installed production component license expression(s).`,
    );
  }
  if (result.environment.platform !== "linux") {
    throw new SupplyChainPolicyError(
      `Production supply-chain verification must run after pnpm install --frozen-lockfile in a Render-equivalent Linux CI environment; received ${result.environment.platform}/${result.environment.architecture}.`,
    );
  }
  return { ...result, policy };
}

function parseArguments(argumentsList) {
  let outputDirectory = defaultOutputDirectory;
  let licensePolicyPath = defaultLicensePolicyPath;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    const value = argumentsList[index + 1];
    if (argument === "--output-dir") {
      outputDirectory = requireExactString(value, "--output-dir");
    } else if (argument === "--license-policy") {
      licensePolicyPath = requireExactString(value, "--license-policy");
    } else {
      throw new SupplyChainPolicyError(
        "Usage: pnpm verify:supply-chain:production --output-dir <directory> --license-policy <approved-policy.json>",
      );
    }
    index += 1;
  }
  return { outputDirectory, licensePolicyPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { outputDirectory, licensePolicyPath } = parseArguments(
      process.argv.slice(2),
    );
    const result = verifyProductionSupplyChain({
      outputDirectory,
      licensePolicyPath,
    });
    process.stdout.write(
      `Production supply-chain gate passed for ${result.components.length} installed components with customer policy ${licensePolicyPath}.\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
