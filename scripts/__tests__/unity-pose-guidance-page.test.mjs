import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("Unity training page wires real pose guidance overlay and stable hit tracker", async () => {
  const unitySurfaceSource = await readFile(
    join(rootDir, "apps/web/src/features/training-runtime/UnityTrainingSurface.tsx"),
    "utf8",
  );
  const visibleCopy = visibleStringLiterals(unitySurfaceSource);

  assert.match(unitySurfaceSource, /createUnityPoseHitTracker/);
  assert.match(unitySurfaceSource, /setPoseGuidance/);
  assert.match(unitySurfaceSource, /UnityPoseCursorOverlay/);
  assert.match(unitySurfaceSource, /UnityPoseCameraPreview/);
  assert.match(visibleCopy, /站位提示/);
  assert.match(visibleCopy, /画面稳定/);
  assert.match(visibleCopy, /按提示完成动作/);
  assert.match(visibleCopy, /目标区域/);
  assert.doesNotMatch(
    visibleCopy,
    /自拍视频|手腕光标|动作稳定度|发光目标|成绩/,
  );
  assert.doesNotMatch(unitySurfaceSource, /命中状态|稳定帧|最近发送|低置信度不会发送 Unity 命中/);
});

function visibleStringLiterals(source) {
  return Array.from(
    source.matchAll(/["'`]([^"'`]*[\u4e00-\u9fff][^"'`]*)["'`]/g),
    ([, text]) => text.trim(),
  )
    .filter(Boolean)
    .join("\n");
}
