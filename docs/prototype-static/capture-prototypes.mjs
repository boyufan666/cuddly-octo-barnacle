import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(__dirname, "../prototype-captures-client");
const htmlUrl = pathToFileURL(path.join(__dirname, "index.html")).toString();

const screens = [
  ["01-login-roles", "01-登录与角色入口.png"],
  ["02-profile-consent", "02-患者建档与知情同意.png"],
  ["03-ai-assessment", "03-AI语音评估.png"],
  ["04-assessment-plan-match", "04-评估结果与智能匹配.png"],
  ["05-today-training", "05-患者今日训练.png"],
  ["06-game-prep", "06-Unity训练准备.png"],
  ["07-game-realtime", "07-游戏实时采集反馈.png"],
  ["08-result-history", "08-训练结果与历史记录.png"],
  ["09-doctor-overview", "09-医师患者详情总览.png"],
  ["10-doctor-plan-editor", "10-医师康复计划编辑.png"],
  ["11-admin-overview", "11-管理后台运营概览.png"],
  ["12-admin-security", "12-安全隐私与审计.png"],
  ["13-family-login", "13-家属登录与授权绑定.png"],
];

mkdirSync(outputDir, { recursive: true });

for (const [screen, fileName] of screens) {
  const target = path.join(outputDir, fileName);
  execFileSync(
    "npx",
    [
      "--yes",
      "playwright",
      "screenshot",
      "--viewport-size=1440,900",
      "--wait-for-selector=.screen.active",
      "--wait-for-timeout=300",
      `${htmlUrl}?screen=${encodeURIComponent(screen)}`,
      target,
    ],
    { stdio: "inherit" },
  );
}
