import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("patient game library presents rehabilitation copy without runtime source notes", async () => {
  const source = await readFile(
    join(rootDir, "apps/web/src/features/patient/GameLibraryPage.tsx"),
    "utf8",
  );

  assert.match(source, /康复目的|训练目标|训练说明/);
  assert.match(source, /patientTrainingTagsLabel/);
  assert.doesNotMatch(
    visibleTextLiterals(source),
    /engine:|license:|sensing:|runtime:|MediaPipe|Phaser|Unity WebGL|\bMIT\b/i,
  );
});

test("admin training governance is the only feature page with source and license notes", async () => {
  const source = await readFile(
    join(rootDir, "apps/web/src/features/admin/TrainingContentGovernance.tsx"),
    "utf8",
  );

  assert.match(source, /训练内容管理/);
  assert.match(source, /来源\/许可说明/);
  assert.match(source, /engine:phaser_canvas/);
  assert.match(source, /license:MIT/);
  assert.match(source, /sensing:mediapipe_pose/);
});

test("game delivery strategy follows the customer supplement for simple cognitive and motor plans", async () => {
  const strategySource = await readFile(
    join(rootDir, "docs/game-module-delivery-strategy.md"),
    "utf8",
  );
  const librarySource = await readFile(
    join(rootDir, "docs/browser-pose-game-library-delivery-plan.md"),
    "utf8",
  );
  const combined = `${strategySource}\n${librarySource}`;

  assert.match(combined, /游戏不用追求复杂度|游戏复杂度不是主交付指标/);
  assert.match(combined, /方案数量和覆盖面/);
  assert.match(combined, /思维类干预游戏/);
  assert.match(combined, /运动类康复干预游戏/);
  for (const example of [
    "乒乓球",
    "羽毛球",
    "太极拳",
    "节奏光剑",
    "虚拟园艺",
    "虚拟家乡记忆",
    "记忆配对",
    "快速计算",
    "麻将",
    "虚拟扑克牌",
    "解谜游戏",
  ]) {
    assert.match(combined, new RegExp(example));
  }
  for (const metric of [
    "游戏完成度",
    "单次训练时长",
    "平均反应时间",
    "动作准确率",
    "错误类型分布",
    "肢体对称性",
    "节奏同步度",
    "用户操作序列",
    "提示/跳过",
    "反应时间下降率",
  ]) {
    assert.match(combined, new RegExp(metric));
  }
  assert.match(combined, /保留现有 Unity、浏览器体感和认知网页训练内容/);
});

function visibleTextLiterals(source) {
  return Array.from(source.matchAll(/>([^<>{}]+)</g), ([, text]) => text.trim())
    .filter(Boolean)
    .join("\n");
}
