export const browserPoseWasmBaseUrl = "/mediapipe/tasks-vision/wasm";
export const browserPoseModelUrl =
  "/mediapipe/models/pose_landmarker_lite.task";

export const browserPoseRuntimeAssets = [
  {
    publicPath: `${browserPoseWasmBaseUrl}/vision_wasm_internal.js`,
    sha256: "e7fd9858e8e8f221d9b96eddc11f8e077f263e0b7bbd79d3cbe882b134274f8c",
  },
  {
    publicPath: `${browserPoseWasmBaseUrl}/vision_wasm_internal.wasm`,
    sha256: "6a5c64584c2ab61c763b6e204afbdbc7ce1caf7f5216187322bca8df94f646bc",
  },
  {
    publicPath: `${browserPoseWasmBaseUrl}/vision_wasm_module_internal.js`,
    sha256: "1f1d6215324a1fe62f6742d49a3db911170987ca18ad8c1b75f1a1c82acf2b44",
  },
  {
    publicPath: `${browserPoseWasmBaseUrl}/vision_wasm_module_internal.wasm`,
    sha256: "617b8e0248dbd27e9d7ece4218004eae4cefb499196d1bb4fa0e3fef21708756",
  },
  {
    publicPath: `${browserPoseWasmBaseUrl}/vision_wasm_nosimd_internal.js`,
    sha256: "438d1fe8ff7f4d946025bc211c291543c037d8a3785ed4eee60f1f521b236296",
  },
  {
    publicPath: `${browserPoseWasmBaseUrl}/vision_wasm_nosimd_internal.wasm`,
    sha256: "8a3092d34c79d3f57e6ba8592105e8a90f6b07c27891ffecd14cca428bfd3e31",
  },
  {
    publicPath: browserPoseModelUrl,
    sha256: "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a",
  },
] as const;

let runtimeAssetVerification: Promise<void> | undefined;

export function ensureBrowserPoseRuntimeAssets() {
  if (!globalThis.fetch || !globalThis.crypto?.subtle) {
    throw new Error("当前浏览器不能校验本地训练识别资源，训练不会启动。");
  }
  runtimeAssetVerification ??= verifyBrowserPoseRuntimeAssets(
    globalThis.fetch.bind(globalThis),
    (bytes) => globalThis.crypto.subtle.digest("SHA-256", bytes),
  );
  return runtimeAssetVerification;
}

export async function verifyBrowserPoseRuntimeAssets(
  fetchAsset: typeof fetch,
  digestSha256: (bytes: ArrayBuffer) => Promise<ArrayBuffer>,
) {
  await Promise.all(
    browserPoseRuntimeAssets.map(async (asset) => {
      const response = await fetchAsset(asset.publicPath, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`本地训练识别资源缺失：${asset.publicPath}`);
      }
      const bytes = await response.arrayBuffer();
      const digest = await digestSha256(bytes);
      if (toHex(digest) !== asset.sha256) {
        throw new Error(`本地训练识别资源完整性校验失败：${asset.publicPath}`);
      }
    }),
  );
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
