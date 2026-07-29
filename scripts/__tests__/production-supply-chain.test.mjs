import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  collectInstalledProductionComponents,
  cyclonedxOutputName,
  licenseInventoryOutputName,
  parsePnpmLockfile,
  produceProductionSupplyChain,
  SupplyChainMetadataError,
} from "../produce-production-supply-chain.mjs";
import {
  SupplyChainPolicyError,
  verifyProductionSupplyChain,
} from "../verify-production-supply-chain.mjs";
import { regressionPlans } from "../run-full-regression.mjs";

function packageStoreDirectory(rootDir, name, version) {
  return join(
    rootDir,
    "node_modules/.pnpm",
    `${name.replaceAll("/", "+")}@${version}`,
    "node_modules",
    ...name.split("/"),
  );
}

function writeInstalledPackage(rootDir, name, version, manifest = {}) {
  const packagePath = packageStoreDirectory(rootDir, name, version);
  mkdirSync(packagePath, { recursive: true });
  writeFileSync(
    join(packagePath, "package.json"),
    `${JSON.stringify({ name, version, license: "MIT", ...manifest })}\n`,
    "utf8",
  );
  return packagePath;
}

function dependency(version) {
  return { specifier: version, version };
}

function writeLockfile(rootDir, lockfile) {
  const source = `${JSON.stringify(lockfile, null, 2)}\n`;
  writeFileSync(join(rootDir, "pnpm-lock.yaml"), source, "utf8");
  return parsePnpmLockfile(source);
}

function createFixture(options = {}) {
  const license = Object.hasOwn(options, "license") ? options.license : "MIT";
  const rootDir = mkdtempSync(join(tmpdir(), "rehab-supply-chain-"));
  const packagePath = writeInstalledPackage(rootDir, "example", "1.0.0", {
    ...(license === undefined ? { license: undefined } : { license }),
    ...(options.manifest ?? {}),
  });
  writeFileSync(
    join(rootDir, "package.json"),
    `${JSON.stringify({ name: "supply-chain-fixture", version: "1.0.0" })}\n`,
    "utf8",
  );
  const lockfile = writeLockfile(rootDir, {
    lockfileVersion: "9.0",
    importers: {
      ".": { dependencies: { example: dependency("1.0.0") } },
    },
    packages: {
      "example@1.0.0": { resolution: { integrity: "fixture-example" } },
    },
    snapshots: { "example@1.0.0": {} },
  });
  return {
    rootDir,
    packagePath,
    lockfile,
    tree: [
      {
        name: "supply-chain-fixture",
        path: rootDir,
        dependencies: {
          example: {
            version: "1.0.0",
            path: packagePath,
          },
        },
      },
    ],
  };
}

function removeFixture(fixture) {
  rmSync(fixture.rootDir, { recursive: true, force: true });
}

function createNestedFixture(options = {}) {
  const rootDir = mkdtempSync(join(tmpdir(), "rehab-supply-chain-platform-"));
  writeFileSync(
    join(rootDir, "package.json"),
    `${JSON.stringify({ name: "supply-chain-fixture", version: "1.0.0" })}\n`,
    "utf8",
  );
  const parentPath = writeInstalledPackage(rootDir, "parent", "1.0.0");
  const childPath = packageStoreDirectory(rootDir, "child", "1.0.0");
  if (options.installChild) {
    writeInstalledPackage(rootDir, "child", "1.0.0", options.childManifest);
  }
  const relationship = options.relationship ?? "optional";
  const childMetadata = options.childMetadata ?? {
    os: ["linux"],
    cpu: ["x64"],
    libc: ["glibc"],
  };
  const childDependencies =
    (options.includeChildDescendant ?? !options.installChild)
      ? {
          omittedDescendant: {
            version: "1.0.0",
            path: join(rootDir, "missing-descendant"),
          },
        }
      : undefined;
  const lockfile = writeLockfile(rootDir, {
    lockfileVersion: "9.0",
    importers: {
      ".": { dependencies: { parent: dependency("1.0.0") } },
    },
    packages: {
      "parent@1.0.0": { resolution: { integrity: "fixture-parent" } },
      "child@1.0.0": {
        resolution: { integrity: "fixture-child" },
        ...childMetadata,
      },
    },
    snapshots: {
      "parent@1.0.0": {
        [`${relationship}Dependencies`]: { child: "1.0.0" },
      },
      "child@1.0.0": {},
    },
  });
  return {
    rootDir,
    childPath,
    lockfile,
    tree: [
      {
        name: "supply-chain-fixture",
        path: rootDir,
        dependencies: {
          parent: {
            version: "1.0.0",
            path: parentPath,
            dependencies: {
              child: {
                version: "1.0.0",
                path: childPath,
                ...(childDependencies
                  ? { dependencies: childDependencies }
                  : {}),
              },
            },
          },
        },
      },
    ],
  };
}

const darwinArm64Target = { platform: "darwin", architecture: "arm64" };
const linuxX64GlibcTarget = {
  platform: "linux",
  architecture: "x64",
  libc: "glibc",
};

test("collects installed external production components from actual pnpm-store paths", () => {
  const fixture = createFixture();
  try {
    const components = collectInstalledProductionComponents({
      rootDir: fixture.rootDir,
      tree: fixture.tree,
      lockfile: fixture.lockfile,
    });
    assert.equal(components.length, 1);
    assert.deepEqual(
      {
        purl: components[0].purl,
        name: components[0].name,
        version: components[0].version,
        license: components[0].license,
        installedPath: components[0].installedPath,
      },
      {
        purl: "pkg:npm/example@1.0.0",
        name: "example",
        version: "1.0.0",
        license: "MIT",
        installedPath: "node_modules/.pnpm/example@1.0.0/node_modules/example",
      },
    );
    assert.match(components[0].packageJsonSha256, /^[a-f0-9]{64}$/);
  } finally {
    removeFixture(fixture);
  }
});

test("fails closed when installed production metadata has no declared license", () => {
  const fixture = createFixture({ license: undefined });
  try {
    assert.throws(
      () =>
        collectInstalledProductionComponents({
          rootDir: fixture.rootDir,
          tree: fixture.tree,
          lockfile: fixture.lockfile,
        }),
      (error) =>
        error instanceof SupplyChainMetadataError &&
        /example@1\.0\.0 must declare its license through exactly one supported package metadata field/.test(
          error.message,
        ),
    );
  } finally {
    removeFixture(fixture);
  }
});

test("accepts exactly one direct legacy npm license declaration", () => {
  const fixture = createFixture({
    license: undefined,
    manifest: { licenses: [{ type: "MIT" }] },
  });
  try {
    const components = collectInstalledProductionComponents({
      rootDir: fixture.rootDir,
      tree: fixture.tree,
      lockfile: fixture.lockfile,
    });
    assert.equal(components.length, 1);
    assert.equal(components[0].license, "MIT");
  } finally {
    removeFixture(fixture);
  }
});

test("rejects ambiguous, plural, or malformed legacy license declarations", () => {
  const ambiguous = createFixture({
    manifest: { licenses: [{ type: "MIT" }] },
  });
  try {
    assert.throws(
      () =>
        collectInstalledProductionComponents({
          rootDir: ambiguous.rootDir,
          tree: ambiguous.tree,
          lockfile: ambiguous.lockfile,
        }),
      /must declare its license through exactly one supported package metadata field/,
    );
  } finally {
    removeFixture(ambiguous);
  }

  const plural = createFixture({
    license: undefined,
    manifest: { licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] },
  });
  try {
    assert.throws(
      () =>
        collectInstalledProductionComponents({
          rootDir: plural.rootDir,
          tree: plural.tree,
          lockfile: plural.lockfile,
        }),
      /licenses must be an array containing exactly one declaration/,
    );
  } finally {
    removeFixture(plural);
  }

  const malformed = createFixture({
    license: undefined,
    manifest: { licenses: [{}] },
  });
  try {
    assert.throws(
      () =>
        collectInstalledProductionComponents({
          rootDir: malformed.rootDir,
          tree: malformed.tree,
          lockfile: malformed.lockfile,
        }),
      /licenses\[0\]\.type must be an exact non-empty string/,
    );
  } finally {
    removeFixture(malformed);
  }
});

test("rejects an empty workspace dependency tree instead of emitting an empty SBOM", () => {
  const fixture = createFixture();
  try {
    assert.throws(
      () =>
        collectInstalledProductionComponents({
          rootDir: fixture.rootDir,
          tree: [],
          lockfile: fixture.lockfile,
        }),
      /refusing an empty workspace SBOM/,
    );
  } finally {
    removeFixture(fixture);
  }
});

test("prunes only a lockfile-classified optional branch that cannot run on the target platform", () => {
  const fixture = createNestedFixture();
  try {
    const components = collectInstalledProductionComponents({
      rootDir: fixture.rootDir,
      tree: fixture.tree,
      lockfile: fixture.lockfile,
      target: darwinArm64Target,
    });
    assert.deepEqual(
      components.map((component) => component.purl),
      ["pkg:npm/parent@1.0.0"],
    );
  } finally {
    removeFixture(fixture);
  }
});

test("fails when a normal dependency path is absent even when its package excludes the target", () => {
  const fixture = createNestedFixture({ relationship: "" });
  fixture.lockfile.snapshots["parent@1.0.0"] = {
    dependencies: { child: "1.0.0" },
  };
  try {
    assert.throws(
      () =>
        collectInstalledProductionComponents({
          rootDir: fixture.rootDir,
          tree: fixture.tree,
          lockfile: fixture.lockfile,
          target: darwinArm64Target,
        }),
      /child\.path does not exist in the current install tree/,
    );
  } finally {
    removeFixture(fixture);
  }
});

test("fails when a current-target compatible optional dependency is absent", () => {
  const fixture = createNestedFixture();
  try {
    assert.throws(
      () =>
        collectInstalledProductionComponents({
          rootDir: fixture.rootDir,
          tree: fixture.tree,
          lockfile: fixture.lockfile,
          target: linuxX64GlibcTarget,
        }),
      /child\.path does not exist in the current install tree/,
    );
  } finally {
    removeFixture(fixture);
  }
});

test("rejects an installed package that is incompatible with the selected target", () => {
  const fixture = createNestedFixture({ installChild: true });
  try {
    assert.throws(
      () =>
        collectInstalledProductionComponents({
          rootDir: fixture.rootDir,
          tree: fixture.tree,
          lockfile: fixture.lockfile,
          target: darwinArm64Target,
        }),
      /child is installed even though child@1\.0\.0 is incompatible/,
    );
  } finally {
    removeFixture(fixture);
  }
});

test("fails closed when matching parent snapshots classify a dependency differently", () => {
  const fixture = createNestedFixture({ installChild: true });
  fixture.lockfile.snapshots["parent@1.0.0(peer@1.0.0)"] = {
    dependencies: { child: "1.0.0" },
  };
  try {
    assert.throws(
      () =>
        collectInstalledProductionComponents({
          rootDir: fixture.rootDir,
          tree: fixture.tree,
          lockfile: fixture.lockfile,
          target: linuxX64GlibcTarget,
        }),
      /ambiguous pnpm lockfile dependency classification/,
    );
  } finally {
    removeFixture(fixture);
  }
});

test("uses pnpm list child versions to select the matching peer snapshot before classifying optionality", () => {
  const fixture = createNestedFixture({ installChild: true });
  fixture.lockfile.snapshots["parent@1.0.0(peer@1.0.0)"] = {
    dependencies: { child: "2.0.0" },
  };
  try {
    const components = collectInstalledProductionComponents({
      rootDir: fixture.rootDir,
      tree: fixture.tree,
      lockfile: fixture.lockfile,
      target: linuxX64GlibcTarget,
    });
    assert.deepEqual(
      components.map((component) => component.purl),
      ["pkg:npm/child@1.0.0", "pkg:npm/parent@1.0.0"],
    );
  } finally {
    removeFixture(fixture);
  }
});

test("fails closed when a missing optional dependency has no exact lock package metadata", () => {
  const fixture = createNestedFixture();
  delete fixture.lockfile.packages["child@1.0.0"];
  try {
    assert.throws(
      () =>
        collectInstalledProductionComponents({
          rootDir: fixture.rootDir,
          tree: fixture.tree,
          lockfile: fixture.lockfile,
          target: darwinArm64Target,
        }),
      /has no exact pnpm lockfile package metadata for child@1\.0\.0/,
    );
  } finally {
    removeFixture(fixture);
  }
});

test("requires an exact libc for every injected Linux target", () => {
  const fixture = createFixture();
  try {
    assert.throws(
      () =>
        collectInstalledProductionComponents({
          rootDir: fixture.rootDir,
          tree: fixture.tree,
          lockfile: fixture.lockfile,
          target: { platform: "linux", architecture: "x64" },
        }),
      /Production target\.libc must be an exact non-empty string/,
    );
  } finally {
    removeFixture(fixture);
  }
});

test("keeps name, version, license, and symlinked package metadata fail-closed", () => {
  const identityFixture = createFixture({ manifest: { name: "not-example" } });
  try {
    assert.throws(
      () =>
        collectInstalledProductionComponents({
          rootDir: identityFixture.rootDir,
          tree: identityFixture.tree,
          lockfile: identityFixture.lockfile,
        }),
      /Installed package metadata identity differs/,
    );
  } finally {
    removeFixture(identityFixture);
  }

  const versionFixture = createFixture({ manifest: { version: "2.0.0" } });
  try {
    assert.throws(
      () =>
        collectInstalledProductionComponents({
          rootDir: versionFixture.rootDir,
          tree: versionFixture.tree,
          lockfile: versionFixture.lockfile,
        }),
      /Installed package metadata identity differs/,
    );
  } finally {
    removeFixture(versionFixture);
  }

  const symlinkFixture = createFixture();
  try {
    const metadataPath = join(symlinkFixture.packagePath, "package.json");
    const replacementPath = join(symlinkFixture.rootDir, "replacement.json");
    writeFileSync(
      replacementPath,
      `${JSON.stringify({ name: "example", version: "1.0.0", license: "MIT" })}\n`,
      "utf8",
    );
    rmSync(metadataPath);
    symlinkSync(replacementPath, metadataPath);
    assert.throws(
      () =>
        collectInstalledProductionComponents({
          rootDir: symlinkFixture.rootDir,
          tree: symlinkFixture.tree,
          lockfile: symlinkFixture.lockfile,
        }),
      /must be a regular file/,
    );
  } finally {
    removeFixture(symlinkFixture);
  }
});

test("allows a pnpm list package-path symlink only after its real path passes every boundary check", () => {
  const fixture = createFixture();
  try {
    const packageLinkPath = join(fixture.rootDir, "listed-example");
    symlinkSync(fixture.packagePath, packageLinkPath);
    fixture.tree[0].dependencies.example.path = packageLinkPath;
    const components = collectInstalledProductionComponents({
      rootDir: fixture.rootDir,
      tree: fixture.tree,
      lockfile: fixture.lockfile,
    });
    assert.equal(components.length, 1);
    assert.equal(
      components[0].installedPath,
      "node_modules/.pnpm/example@1.0.0/node_modules/example",
    );
  } finally {
    removeFixture(fixture);
  }
});

test("writes CycloneDX and license inventory artifacts with lockfile and generation environment", () => {
  const fixture = createFixture();
  const outputDirectory = resolve(fixture.rootDir, "output/supply-chain");
  try {
    const result = produceProductionSupplyChain({
      outputDirectory,
      rootDir: fixture.rootDir,
      tree: fixture.tree,
      target: linuxX64GlibcTarget,
    });

    assert.equal(existsSync(result.sbomPath), true);
    assert.equal(existsSync(result.licenseInventoryPath), true);
    assert.equal(
      resolve(result.sbomPath),
      join(outputDirectory, cyclonedxOutputName),
    );
    assert.equal(
      resolve(result.licenseInventoryPath),
      join(outputDirectory, licenseInventoryOutputName),
    );
    assert.equal(result.sbom.bomFormat, "CycloneDX");
    assert.equal(result.sbom.specVersion, "1.5");
    assert.equal(result.sbom.components[0].licenses[0].license.name, "MIT");
    assert.match(result.environment.lockfileSha256, /^[a-f0-9]{64}$/);
    assert.equal(
      result.licenseInventory.generationEnvironment.platform,
      "linux",
    );
    assert.equal(result.licenseInventory.generationEnvironment.libc, "glibc");
    assert.equal(
      JSON.parse(
        readFileSync(result.sbomPath, "utf8"),
      ).metadata.properties.some(
        (property) => property.name === "rehab-platform:pnpm-lock-sha256",
      ),
      true,
    );
    assert.equal(
      JSON.parse(
        readFileSync(result.sbomPath, "utf8"),
      ).metadata.properties.some(
        (property) =>
          property.name === "rehab-platform:libc" && property.value === "glibc",
      ),
      true,
    );
  } finally {
    removeFixture(fixture);
  }
});

test("requires a customer-approved policy matching the generated lockfile and every license", () => {
  const fixture = createFixture();
  const outputDirectory = resolve(fixture.rootDir, "output/supply-chain");
  const licensePolicyPath = resolve(
    fixture.rootDir,
    "customer-license-policy.json",
  );
  try {
    assert.throws(
      () =>
        verifyProductionSupplyChain({
          outputDirectory,
          licensePolicyPath,
          rootDir: fixture.rootDir,
          tree: fixture.tree,
        }),
      (error) =>
        error instanceof SupplyChainPolicyError &&
        /Customer-approved license policy is required/.test(error.message),
    );

    const generated = produceProductionSupplyChain({
      outputDirectory,
      rootDir: fixture.rootDir,
      tree: fixture.tree,
    });
    writeFileSync(
      licensePolicyPath,
      `${JSON.stringify({
        schema: "rehab-platform/customer-license-policy/v1",
        policyVersion: 1,
        status: "approved",
        lockfileSha256: generated.environment.lockfileSha256,
        approvedBy: "customer-security-owner",
        approvedAt: "2026-07-22T00:00:00.000Z",
        allowedLicenseExpressions: ["MIT"],
      })}\n`,
      "utf8",
    );

    if (process.platform === "linux") {
      const verified = verifyProductionSupplyChain({
        outputDirectory,
        licensePolicyPath,
        rootDir: fixture.rootDir,
        tree: fixture.tree,
      });
      assert.equal(verified.components.length, 1);
      assert.equal(verified.policy.status, "approved");
    } else {
      assert.throws(
        () =>
          verifyProductionSupplyChain({
            outputDirectory,
            licensePolicyPath,
            rootDir: fixture.rootDir,
            tree: fixture.tree,
          }),
        (error) =>
          error instanceof SupplyChainPolicyError &&
          /Render-equivalent Linux CI environment/.test(error.message),
      );
    }
  } finally {
    removeFixture(fixture);
  }
});

test("rejects unapproved component exceptions in customer license policy", () => {
  const fixture = createFixture();
  const outputDirectory = resolve(fixture.rootDir, "output/supply-chain");
  const licensePolicyPath = resolve(
    fixture.rootDir,
    "customer-license-policy.json",
  );
  try {
    const generated = produceProductionSupplyChain({
      outputDirectory,
      rootDir: fixture.rootDir,
      tree: fixture.tree,
    });
    writeFileSync(
      licensePolicyPath,
      `${JSON.stringify({
        schema: "rehab-platform/customer-license-policy/v1",
        policyVersion: 1,
        status: "approved",
        lockfileSha256: generated.environment.lockfileSha256,
        approvedBy: "customer-security-owner",
        approvedAt: "2026-07-22T00:00:00.000Z",
        allowedLicenseExpressions: ["MIT"],
        waiver: "not accepted",
      })}\n`,
      "utf8",
    );

    assert.throws(
      () =>
        verifyProductionSupplyChain({
          outputDirectory,
          licensePolicyPath,
          rootDir: fixture.rootDir,
          tree: fixture.tree,
        }),
      (error) =>
        error instanceof SupplyChainPolicyError &&
        /waivers and component exceptions are not accepted/.test(error.message),
    );
  } finally {
    removeFixture(fixture);
  }
});

test("static and full regression scopes include the production supply-chain gate", () => {
  for (const scope of ["static", "full"]) {
    assert.equal(
      regressionPlans[scope].some(({ id }) => id === "supply-chain:production"),
      true,
    );
  }
});
