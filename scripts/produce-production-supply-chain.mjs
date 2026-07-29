#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptDir, "..");
export const defaultOutputDirectory = resolve(
  repositoryRoot,
  "output/supply-chain",
);
export const cyclonedxOutputName = "production-dependencies.cdx.json";
export const licenseInventoryOutputName =
  "production-dependencies.licenses.json";

export class SupplyChainMetadataError extends Error {}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readExactRegularFile(path, label) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    throw new SupplyChainMetadataError(`${label} is unavailable at ${path}.`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new SupplyChainMetadataError(`${label} must be a regular file.`);
  }
  return readFileSync(path);
}

function parseJsonFile(path, label) {
  const source = readExactRegularFile(path, label).toString("utf8");
  try {
    return JSON.parse(source);
  } catch {
    throw new SupplyChainMetadataError(`${label} must contain valid JSON.`);
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value, label) {
  if (!isRecord(value)) {
    throw new SupplyChainMetadataError(`${label} must be an object.`);
  }
  return value;
}

function requireExactString(value, label) {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new SupplyChainMetadataError(
      `${label} must be an exact non-empty string.`,
    );
  }
  return value;
}

function isPathInside(parent, candidate) {
  const pathFromParent = relative(parent, candidate);
  return (
    pathFromParent === "" ||
    (!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent))
  );
}

function npmPackageUrl(name, version) {
  const encodedName = encodeURIComponent(name).replaceAll("%2F", "/");
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

function normalizeTarget(target, label = "Production target") {
  const source = requireRecord(target, label);
  const platform = requireExactString(source.platform, `${label}.platform`);
  const architecture = requireExactString(
    source.architecture,
    `${label}.architecture`,
  );
  const hasLibc = Object.hasOwn(source, "libc") && source.libc !== undefined;
  if (platform !== "linux") {
    if (hasLibc) {
      throw new SupplyChainMetadataError(
        `${label}.libc is only valid for a Linux target.`,
      );
    }
    return { platform, architecture };
  }
  const libc = requireExactString(source.libc, `${label}.libc`);
  if (libc !== "glibc" && libc !== "musl") {
    throw new SupplyChainMetadataError(
      `${label}.libc must be exactly glibc or musl for a Linux target.`,
    );
  }
  return { platform, architecture, libc };
}

export function currentProductionTarget() {
  if (process.platform !== "linux") {
    return normalizeTarget({
      platform: process.platform,
      architecture: process.arch,
    });
  }
  let runtimeReport;
  try {
    runtimeReport = process.report?.getReport?.();
  } catch (error) {
    throw new SupplyChainMetadataError(
      `Unable to determine Linux libc from the Node runtime report: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const glibcVersion = runtimeReport?.header?.glibcVersionRuntime;
  if (
    typeof glibcVersion !== "string" ||
    glibcVersion === "" ||
    glibcVersion.trim() !== glibcVersion
  ) {
    throw new SupplyChainMetadataError(
      "Unable to determine Linux libc exactly from the Node runtime report; refusing to classify platform-specific optional dependencies.",
    );
  }
  return normalizeTarget({
    platform: process.platform,
    architecture: process.arch,
    libc: "glibc",
  });
}

function productionEnvironment(rootDir, lockfileSha256, pnpmVersion, target) {
  return {
    nodeVersion: process.version,
    pnpmVersion,
    platform: target.platform,
    architecture: target.architecture,
    ...(target.libc ? { libc: target.libc } : {}),
    lockfilePath: relative(rootDir, resolve(rootDir, "pnpm-lock.yaml")),
    lockfileSha256,
  };
}

export function parsePnpmLockfile(source) {
  if (typeof source !== "string") {
    throw new SupplyChainMetadataError(
      "pnpm lockfile source must be a string.",
    );
  }
  let parsed;
  try {
    parsed = load(source, { json: false });
  } catch (error) {
    throw new SupplyChainMetadataError(
      `pnpm lockfile must contain valid YAML: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const lockfile = requireRecord(parsed, "pnpm lockfile");
  if (lockfile.lockfileVersion !== "9.0") {
    throw new SupplyChainMetadataError(
      "pnpm lockfileVersion must be exactly 9.0 for production dependency classification.",
    );
  }
  requireRecord(lockfile.importers, "pnpm lockfile.importers");
  requireRecord(lockfile.packages, "pnpm lockfile.packages");
  requireRecord(lockfile.snapshots, "pnpm lockfile.snapshots");
  return lockfile;
}

function runPnpmProductionList(rootDir, run = spawnSync) {
  const result = run(
    "pnpm",
    ["list", "-r", "--prod", "--depth", "Infinity", "--json"],
    {
      cwd: rootDir,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error) {
    throw new SupplyChainMetadataError(
      `Unable to inspect the installed pnpm production dependency tree: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new SupplyChainMetadataError(
      `pnpm list --prod failed: ${(result.stderr || "unknown pnpm failure").trim()}`,
    );
  }
  try {
    const parsed = JSON.parse(result.stdout);
    if (!Array.isArray(parsed)) {
      throw new Error("not an array");
    }
    return parsed;
  } catch {
    throw new SupplyChainMetadataError(
      "pnpm list --prod did not return a production dependency tree JSON array.",
    );
  }
}

function inspectInstalledPackagePath(rootDir, rawPath, label) {
  const pnpmStore = resolve(rootDir, "node_modules/.pnpm");
  const sourcePath = requireExactString(rawPath, `${label}.path`);
  let sourceStat;
  try {
    sourceStat = lstatSync(sourcePath);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return { kind: "missing" };
    }
    throw new SupplyChainMetadataError(
      `${label}.path could not be inspected in the current install tree.`,
    );
  }
  if (!sourceStat.isDirectory() && !sourceStat.isSymbolicLink()) {
    throw new SupplyChainMetadataError(
      `${label}.path must be a package directory or a symlink to one.`,
    );
  }
  let installedPath;
  try {
    installedPath = realpathSync(sourcePath);
  } catch {
    throw new SupplyChainMetadataError(
      `${label}.path does not exist in the current install tree.`,
    );
  }
  const installedStat = lstatSync(installedPath);
  if (!installedStat.isDirectory() || installedStat.isSymbolicLink()) {
    throw new SupplyChainMetadataError(
      `${label}.path must resolve to a non-symlink package directory.`,
    );
  }

  if (isPathInside(pnpmStore, installedPath)) {
    return { kind: "external", path: installedPath };
  }
  if (isPathInside(rootDir, installedPath)) {
    return { kind: "workspace", path: installedPath };
  }
  throw new SupplyChainMetadataError(
    `${label}.path must resolve inside the repository workspace or node_modules/.pnpm.`,
  );
}

function packageLocator(name, version) {
  return `${name}@${version}`;
}

function exactResolvedVersion(value, label) {
  const raw = requireExactString(value, label);
  if (raw.startsWith("link:") || raw.startsWith("file:")) {
    return { kind: "workspace", value: raw };
  }
  const peerSuffixIndex = raw.indexOf("(");
  const version = peerSuffixIndex === -1 ? raw : raw.slice(0, peerSuffixIndex);
  return {
    kind: "external",
    value: requireExactString(version, `${label} resolved version`),
  };
}

function exactDependencyReference(value, label) {
  if (typeof value === "string") return exactResolvedVersion(value, label);
  const record = requireRecord(value, label);
  return exactResolvedVersion(record.version, `${label}.version`);
}

function relationFromDependencyMaps(owner, name, version, label) {
  const normalDependencies = owner.dependencies;
  const optionalDependencies = owner.optionalDependencies;
  if (normalDependencies !== undefined) {
    requireRecord(normalDependencies, `${label}.dependencies`);
  }
  if (optionalDependencies !== undefined) {
    requireRecord(optionalDependencies, `${label}.optionalDependencies`);
  }
  const normal = normalDependencies?.[name];
  const optional = optionalDependencies?.[name];
  if (normal !== undefined && optional !== undefined) {
    throw new SupplyChainMetadataError(
      `${label} declares ${name} as both a normal and optional dependency.`,
    );
  }
  const relationship =
    normal !== undefined
      ? {
          kind: "normal",
          reference: exactDependencyReference(
            normal,
            `${label}.dependencies.${name}`,
          ),
        }
      : optional !== undefined
        ? {
            kind: "optional",
            reference: exactDependencyReference(
              optional,
              `${label}.optionalDependencies.${name}`,
            ),
          }
        : undefined;
  if (!relationship) {
    throw new SupplyChainMetadataError(
      `${label} does not declare dependency ${name}.`,
    );
  }
  if (
    relationship.reference.kind === "external" &&
    relationship.reference.value !== version
  ) {
    throw new SupplyChainMetadataError(
      `${label} resolves ${name} to ${relationship.reference.value}, but pnpm list reports ${version}.`,
    );
  }
  return relationship;
}

function createLockfileIndex(lockfile) {
  return {
    importers: requireRecord(lockfile.importers, "pnpm lockfile.importers"),
    packages: requireRecord(lockfile.packages, "pnpm lockfile.packages"),
    snapshots: requireRecord(lockfile.snapshots, "pnpm lockfile.snapshots"),
  };
}

function importerContext(rootDir, index, workspace, label) {
  const workspacePath = requireExactString(workspace.path, `${label}.path`);
  let resolvedWorkspacePath;
  try {
    resolvedWorkspacePath = realpathSync(workspacePath);
  } catch {
    throw new SupplyChainMetadataError(
      `${label}.path does not exist in the current workspace tree.`,
    );
  }
  if (!isPathInside(rootDir, resolvedWorkspacePath)) {
    throw new SupplyChainMetadataError(
      `${label}.path must resolve inside the repository workspace.`,
    );
  }
  const importerId =
    relative(rootDir, resolvedWorkspacePath).replaceAll("\\", "/") || ".";
  const importer = index.importers[importerId];
  if (!isRecord(importer)) {
    throw new SupplyChainMetadataError(
      `${label}.path does not map to a pnpm lockfile importer.`,
    );
  }
  return { kind: "importer", id: importerId, value: importer };
}

function snapshotContext(index, name, version, label) {
  const locator = packageLocator(name, version);
  const candidates = Object.entries(index.snapshots).filter(
    ([key, value]) =>
      (key === locator || key.startsWith(`${locator}(`)) && isRecord(value),
  );
  if (candidates.length === 0) {
    throw new SupplyChainMetadataError(
      `${label} has no matching pnpm lockfile snapshot for ${locator}.`,
    );
  }
  return { kind: "snapshot", locator, candidates };
}

function constrainSnapshotContext(parent, dependencies, ownerLabel) {
  if (parent.kind === "importer" || dependencies === undefined) return parent;
  const listedDependencies = requireRecord(
    dependencies,
    `${ownerLabel}.dependencies`,
  );
  const listedEntries = Object.keys(listedDependencies).map((name) => {
    const dependency = requireRecord(
      listedDependencies[name],
      `${ownerLabel}.dependencies.${name}`,
    );
    return {
      name,
      version: requireExactString(
        dependency.version,
        `${ownerLabel}.dependencies.${name}.version`,
      ),
    };
  });
  const candidates = parent.candidates.filter(([, snapshot]) => {
    try {
      for (const { name, version } of listedEntries) {
        relationFromDependencyMaps(
          snapshot,
          name,
          version,
          "candidate pnpm lockfile snapshot",
        );
      }
      return true;
    } catch {
      return false;
    }
  });
  if (candidates.length === 0) {
    throw new SupplyChainMetadataError(
      `${ownerLabel} does not match any pnpm lockfile snapshot for ${parent.locator}.`,
    );
  }
  return { ...parent, candidates };
}

function dependencyRelation(parent, name, version, label) {
  if (parent.kind === "importer") {
    return relationFromDependencyMaps(
      parent.value,
      name,
      version,
      `pnpm lockfile.importers.${parent.id}`,
    );
  }
  const relations = parent.candidates.map(([snapshotKey, snapshot]) => ({
    snapshotKey,
    relation: relationFromDependencyMaps(
      snapshot,
      name,
      version,
      `pnpm lockfile.snapshots.${snapshotKey}`,
    ),
  }));
  const first = relations[0].relation;
  for (const { snapshotKey, relation } of relations.slice(1)) {
    if (
      relation.kind !== first.kind ||
      relation.reference.kind !== first.reference.kind ||
      relation.reference.value !== first.reference.value
    ) {
      throw new SupplyChainMetadataError(
        `${label} has ambiguous pnpm lockfile dependency classification for ${name}; snapshot ${snapshotKey} differs from another matching parent snapshot.`,
      );
    }
  }
  return first;
}

function constraintValues(value, label) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new SupplyChainMetadataError(`${label} must be a non-empty array.`);
  }
  const values = new Set();
  for (const item of value) {
    const exact = requireExactString(item, label);
    const name = exact.startsWith("!") ? exact.slice(1) : exact;
    requireExactString(name, `${label} entry`);
    if (values.has(exact)) {
      throw new SupplyChainMetadataError(
        `${label} must not contain duplicates.`,
      );
    }
    values.add(exact);
  }
  return [...values];
}

function packagePlatformMetadata(index, name, version, label) {
  const locator = packageLocator(name, version);
  const entry = index.packages[locator];
  if (!isRecord(entry)) {
    throw new SupplyChainMetadataError(
      `${label} has no exact pnpm lockfile package metadata for ${locator}.`,
    );
  }
  return {
    locator,
    os: constraintValues(entry.os, `pnpm lockfile.packages.${locator}.os`),
    cpu: constraintValues(entry.cpu, `pnpm lockfile.packages.${locator}.cpu`),
    libc: constraintValues(
      entry.libc,
      `pnpm lockfile.packages.${locator}.libc`,
    ),
  };
}

function constraintAllows(values, targetValue) {
  if (!values) return true;
  if (values.includes(`!${targetValue}`)) return false;
  const allowed = values.filter((value) => !value.startsWith("!"));
  return allowed.length === 0 || allowed.includes(targetValue);
}

function targetSupportsPackage(metadata, target, label) {
  if (!constraintAllows(metadata.os, target.platform)) return false;
  if (!constraintAllows(metadata.cpu, target.architecture)) return false;
  if (!metadata.libc) return true;
  if (target.platform !== "linux") return false;
  if (!target.libc) {
    throw new SupplyChainMetadataError(
      `${label} requires an exact Linux libc target classification.`,
    );
  }
  return constraintAllows(metadata.libc, target.libc);
}

function requireDeclaredPackageLicense(manifest, label) {
  const hasLicense = Object.hasOwn(manifest, "license");
  const hasLegacyLicenses = Object.hasOwn(manifest, "licenses");

  if (hasLicense && hasLegacyLicenses) {
    throw new SupplyChainMetadataError(
      `${label} must declare its license through exactly one supported package metadata field.`,
    );
  }
  if (hasLicense) {
    return requireExactString(manifest.license, `${label} license`);
  }
  if (!hasLegacyLicenses) {
    throw new SupplyChainMetadataError(
      `${label} must declare its license through exactly one supported package metadata field.`,
    );
  }
  if (!Array.isArray(manifest.licenses) || manifest.licenses.length !== 1) {
    throw new SupplyChainMetadataError(
      `${label} licenses must be an array containing exactly one declaration.`,
    );
  }
  const [legacyLicense] = manifest.licenses;
  if (!isRecord(legacyLicense)) {
    throw new SupplyChainMetadataError(
      `${label} licenses[0] must be an object.`,
    );
  }
  return requireExactString(legacyLicense.type, `${label} licenses[0].type`);
}

function readInstalledComponent(name, version, packagePath, rootDir) {
  const manifestPath = join(packagePath, "package.json");
  const manifestSource = readExactRegularFile(
    manifestPath,
    `Installed package metadata for ${name}@${version}`,
  );
  let manifest;
  try {
    manifest = JSON.parse(manifestSource.toString("utf8"));
  } catch {
    throw new SupplyChainMetadataError(
      `Installed package metadata for ${name}@${version} must be valid JSON.`,
    );
  }
  if (!isRecord(manifest)) {
    throw new SupplyChainMetadataError(
      `Installed package metadata for ${name}@${version} must be an object.`,
    );
  }
  if (manifest.name !== name || manifest.version !== version) {
    throw new SupplyChainMetadataError(
      `Installed package metadata identity differs from pnpm list for ${name}@${version}.`,
    );
  }
  const license = requireDeclaredPackageLicense(
    manifest,
    `Installed package ${name}@${version}`,
  );
  const purl = npmPackageUrl(name, version);
  return {
    purl,
    name,
    version,
    license,
    packageJsonSha256: sha256(manifestSource),
    installedPath: relative(rootDir, packagePath),
  };
}

export function collectInstalledProductionComponents({
  tree,
  rootDir,
  lockfile,
  target = currentProductionTarget(),
}) {
  if (!Array.isArray(tree)) {
    throw new SupplyChainMetadataError(
      "Production dependency tree must be an array.",
    );
  }
  const resolvedRoot = realpathSync(rootDir);
  const lockfileIndex = createLockfileIndex(lockfile);
  const resolvedTarget = normalizeTarget(target);
  const componentsByPurl = new Map();
  const failures = new Set();

  function addComponent(component) {
    const existing = componentsByPurl.get(component.purl);
    if (
      existing &&
      (existing.license !== component.license ||
        existing.packageJsonSha256 !== component.packageJsonSha256)
    ) {
      throw new SupplyChainMetadataError(
        `Installed package metadata is inconsistent for ${component.purl}.`,
      );
    }
    componentsByPurl.set(component.purl, component);
  }

  function walkDependencies(dependencies, ownerLabel, parent) {
    if (dependencies === undefined) return;
    if (!isRecord(dependencies)) {
      throw new SupplyChainMetadataError(
        `${ownerLabel}.dependencies must be an object.`,
      );
    }
    const constrainedParent = constrainSnapshotContext(
      parent,
      dependencies,
      ownerLabel,
    );
    for (const name of Object.keys(dependencies).sort()) {
      const dependency = dependencies[name];
      const label = `${ownerLabel}.dependencies.${name}`;
      if (!isRecord(dependency)) {
        failures.add(`${label} must be an object.`);
        continue;
      }
      try {
        const version = requireExactString(
          dependency.version,
          `${label}.version`,
        );
        const relationship = dependencyRelation(
          constrainedParent,
          name,
          version,
          label,
        );
        const rawPath = requireExactString(dependency.path, `${label}.path`);
        const resolvedPath = inspectInstalledPackagePath(
          resolvedRoot,
          rawPath,
          label,
        );
        const platformMetadata =
          relationship.reference.kind === "external"
            ? packagePlatformMetadata(lockfileIndex, name, version, label)
            : undefined;

        if (resolvedPath.kind === "missing") {
          const mayPrune =
            relationship.kind === "optional" &&
            platformMetadata &&
            !targetSupportsPackage(platformMetadata, resolvedTarget, label);
          if (mayPrune) continue;
          throw new SupplyChainMetadataError(
            `${label}.path does not exist in the current install tree.`,
          );
        }

        if (relationship.reference.kind === "workspace") {
          if (resolvedPath.kind !== "workspace") {
            throw new SupplyChainMetadataError(
              `${label} is a workspace dependency in pnpm lockfile but does not resolve inside the repository workspace.`,
            );
          }
          const childParent = importerContext(
            resolvedRoot,
            lockfileIndex,
            { path: resolvedPath.path },
            label,
          );
          walkDependencies(dependency.dependencies, label, childParent);
          continue;
        }

        if (resolvedPath.kind !== "external") {
          throw new SupplyChainMetadataError(
            `${label} is an external pnpm dependency but resolves inside the repository workspace.`,
          );
        }
        if (!targetSupportsPackage(platformMetadata, resolvedTarget, label)) {
          throw new SupplyChainMetadataError(
            `${label} is installed even though ${platformMetadata.locator} is incompatible with ${resolvedTarget.platform}/${resolvedTarget.architecture}${resolvedTarget.libc ? `/${resolvedTarget.libc}` : ""}.`,
          );
        }
        if (resolvedPath.kind === "external") {
          const component = readInstalledComponent(
            name,
            version,
            resolvedPath.path,
            resolvedRoot,
          );
          addComponent(component);
        }
        const childParent = snapshotContext(
          lockfileIndex,
          name,
          version,
          label,
        );
        walkDependencies(dependency.dependencies, label, childParent);
      } catch (error) {
        failures.add(error instanceof Error ? error.message : String(error));
      }
    }
  }

  for (const [index, workspace] of tree.entries()) {
    if (!isRecord(workspace)) {
      failures.add(
        `Production dependency tree entry ${index} must be an object.`,
      );
      continue;
    }
    const label = `productionTree[${index}]`;
    try {
      const parent = importerContext(
        resolvedRoot,
        lockfileIndex,
        workspace,
        label,
      );
      walkDependencies(workspace.dependencies, label, parent);
    } catch (error) {
      failures.add(error instanceof Error ? error.message : String(error));
    }
  }

  const components = [...componentsByPurl.values()].sort((left, right) =>
    left.purl.localeCompare(right.purl),
  );
  if (components.length === 0) {
    failures.add(
      "Installed pnpm production dependency tree contains no external components; refusing an empty workspace SBOM.",
    );
  }
  if (failures.size > 0) {
    throw new SupplyChainMetadataError(
      `Production dependency inventory is incomplete; refusing to generate a partial SBOM:\n${[
        ...failures,
      ]
        .sort()
        .map((failure) => `- ${failure}`)
        .join("\n")}`,
    );
  }
  return components;
}

function rootApplication(rootDir) {
  const packageJson = parseJsonFile(
    join(rootDir, "package.json"),
    "Root package metadata",
  );
  if (!isRecord(packageJson)) {
    throw new SupplyChainMetadataError(
      "Root package metadata must be an object.",
    );
  }
  const name = requireExactString(packageJson.name, "Root package name");
  const version = requireExactString(
    packageJson.version,
    "Root package version",
  );
  return {
    type: "application",
    "bom-ref": npmPackageUrl(name, version),
    name,
    version,
  };
}

function cyclonedxComponent(component) {
  return {
    type: "library",
    "bom-ref": component.purl,
    name: component.name,
    version: component.version,
    purl: component.purl,
    licenses: [{ license: { name: component.license } }],
    properties: [
      {
        name: "rehab-platform:installed-package-json-sha256",
        value: component.packageJsonSha256,
      },
      {
        name: "rehab-platform:installed-path",
        value: component.installedPath,
      },
    ],
  };
}

function buildCycloneDxBom({ rootDir, environment, components }) {
  const generationProperties = [
    {
      name: "rehab-platform:pnpm-lock-sha256",
      value: environment.lockfileSha256,
    },
    { name: "rehab-platform:node-version", value: environment.nodeVersion },
    { name: "rehab-platform:pnpm-version", value: environment.pnpmVersion },
    { name: "rehab-platform:platform", value: environment.platform },
    {
      name: "rehab-platform:architecture",
      value: environment.architecture,
    },
  ];
  if (environment.libc) {
    generationProperties.push({
      name: "rehab-platform:libc",
      value: environment.libc,
    });
  }
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      component: rootApplication(rootDir),
      properties: generationProperties,
    },
    components: components.map(cyclonedxComponent),
  };
}

function buildLicenseInventory({ environment, components }) {
  return {
    format: "rehab-platform/production-license-inventory/v1",
    generationEnvironment: environment,
    components: components.map((component) => ({
      purl: component.purl,
      name: component.name,
      version: component.version,
      declaredLicense: component.license,
      packageJsonSha256: component.packageJsonSha256,
      installedPath: component.installedPath,
    })),
  };
}

function pnpmVersion(rootDir, run = spawnSync) {
  const result = run("pnpm", ["--version"], {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    throw new SupplyChainMetadataError(
      "Unable to determine the current pnpm version.",
    );
  }
  return requireExactString(result.stdout.trim(), "pnpm version");
}

function writeDeterministicJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function produceProductionSupplyChain({
  rootDir = repositoryRoot,
  outputDirectory = defaultOutputDirectory,
  tree,
  run = spawnSync,
  target = currentProductionTarget(),
} = {}) {
  const resolvedRoot = realpathSync(rootDir);
  const lockfile = readExactRegularFile(
    join(resolvedRoot, "pnpm-lock.yaml"),
    "pnpm lockfile",
  );
  const lockfileSha256 = sha256(lockfile);
  const parsedLockfile = parsePnpmLockfile(lockfile.toString("utf8"));
  const resolvedTarget = normalizeTarget(target);
  const environment = productionEnvironment(
    resolvedRoot,
    lockfileSha256,
    pnpmVersion(resolvedRoot, run),
    resolvedTarget,
  );
  const productionTree = tree ?? runPnpmProductionList(resolvedRoot, run);
  const components = collectInstalledProductionComponents({
    tree: productionTree,
    rootDir: resolvedRoot,
    lockfile: parsedLockfile,
    target: resolvedTarget,
  });
  const sbom = buildCycloneDxBom({
    rootDir: resolvedRoot,
    environment,
    components,
  });
  const licenseInventory = buildLicenseInventory({ environment, components });
  const resolvedOutputDirectory = resolve(outputDirectory);
  const sbomPath = join(resolvedOutputDirectory, cyclonedxOutputName);
  const licenseInventoryPath = join(
    resolvedOutputDirectory,
    licenseInventoryOutputName,
  );
  writeDeterministicJson(sbomPath, sbom);
  writeDeterministicJson(licenseInventoryPath, licenseInventory);
  return {
    components,
    environment,
    licenseInventory,
    licenseInventoryPath,
    sbom,
    sbomPath,
  };
}

function parseArguments(argumentsList) {
  let outputDirectory = defaultOutputDirectory;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument !== "--output-dir") {
      throw new SupplyChainMetadataError(
        "Usage: pnpm supply-chain:artifacts --output-dir <directory>",
      );
    }
    const value = argumentsList[index + 1];
    outputDirectory = requireExactString(value, "--output-dir");
    index += 1;
  }
  return { outputDirectory };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { outputDirectory } = parseArguments(process.argv.slice(2));
    const result = produceProductionSupplyChain({ outputDirectory });
    process.stdout.write(
      `Generated production CycloneDX SBOM and license inventory for ${result.components.length} installed components. Lockfile SHA-256: ${result.environment.lockfileSha256}.\n`,
    );
    process.stdout.write(`SBOM: ${result.sbomPath}\n`);
    process.stdout.write(`Licenses: ${result.licenseInventoryPath}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
