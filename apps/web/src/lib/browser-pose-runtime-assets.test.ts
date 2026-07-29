import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  browserPoseModelUrl,
  browserPoseRuntimeAssets,
  browserPoseWasmBaseUrl,
  verifyBrowserPoseRuntimeAssets,
} from "./browser-pose-runtime-assets.ts";

const publicRoot = join(dirname(fileURLToPath(import.meta.url)), "../../public");

test("browser pose runtime assets exist locally and match locked SHA-256 hashes", async () => {
  assert.equal(browserPoseRuntimeAssets.length, 7);
  for (const asset of browserPoseRuntimeAssets) {
    assert.match(asset.publicPath, /^\/mediapipe\//);
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    const bytes = await readFile(join(publicRoot, asset.publicPath.slice(1)));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      asset.sha256,
      `${asset.publicPath} hash mismatch`,
    );
  }
});

test("browser pose runtime URLs never point at a public CDN", () => {
  assert.equal(browserPoseWasmBaseUrl, "/mediapipe/tasks-vision/wasm");
  assert.equal(
    browserPoseModelUrl,
    "/mediapipe/models/pose_landmarker_lite.task",
  );
  assert.doesNotMatch(
    JSON.stringify({
      browserPoseWasmBaseUrl,
      browserPoseModelUrl,
      browserPoseRuntimeAssets,
    }),
    /https?:\/\//,
  );
});

test("browser pose runtime hard-fails when a local resource is missing", async () => {
  await assert.rejects(
    verifyBrowserPoseRuntimeAssets(
      async () => new Response(null, { status: 404 }),
      (bytes) => webcrypto.subtle.digest("SHA-256", bytes),
    ),
    /本地训练识别资源缺失/,
  );
});

test("browser pose runtime hard-fails when a local resource hash changes", async () => {
  await assert.rejects(
    verifyBrowserPoseRuntimeAssets(
      async () => new Response(new Uint8Array([1, 2, 3])),
      (bytes) => webcrypto.subtle.digest("SHA-256", bytes),
    ),
    /完整性校验失败/,
  );
});
