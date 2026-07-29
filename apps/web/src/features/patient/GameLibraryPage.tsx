import { Activity, Clock3, Gauge, HeartPulse } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { browserPoseGameDefinitions } from "@/lib/browser-pose-game-library";
import {
  patientTrainingCategoryLabel,
  patientTrainingDifficultyLabel,
  patientTrainingPurposeLabel,
  patientTrainingTagsLabel,
} from "./patient-training-copy";

const extraPlanVarietyGames = [
  {
    code: "rhythm_reach_3d",
    name: "节奏触达 3D",
    clinicalPurpose: "训练反应速度、注意保持和上肢节奏触达控制。",
    patientInstruction: "跟随节奏提示完成触达动作，系统记录完成度和动作稳定性。",
    trainingTargets: ["运动训练", "reaction", "attention", "upper_limb"],
    tags: [
      "运动训练",
      "purpose:risk_assessment",
      "purpose:intervention",
      "风险评估辅助",
      "干预训练",
      "中低强度",
      "反应",
      "动作准确率",
    ],
    defaultDuration: 6,
    defaultDifficulty: "standard",
  },
  {
    code: "memory_path",
    name: "记忆路径",
    clinicalPurpose: "训练近记忆、序列回忆和路线规划，也可辅助记录认知表现变化。",
    patientInstruction: "记住路径顺序，再按提示完成选择。",
    trainingTargets: ["思维训练", "memory", "sequence", "executive"],
    tags: [
      "思维训练",
      "purpose:risk_assessment",
      "purpose:intervention",
      "风险评估辅助",
      "干预训练",
      "近记忆",
      "序列回忆",
      "路径完成",
      "低强度",
    ],
    defaultDuration: 8,
    defaultDifficulty: "三步路径",
  },
  {
    code: "memory_basket",
    name: "记忆果篮",
    clinicalPurpose: "训练近记忆、识别判断和持续注意，可辅助记录认知表现变化。",
    patientInstruction: "记住果篮中的目标，再按提示完成选择。",
    trainingTargets: ["思维训练", "memory", "recognition"],
    tags: [
      "思维训练",
      "purpose:risk_assessment",
      "purpose:intervention",
      "风险评估辅助",
      "干预训练",
      "近记忆",
      "认知",
      "低强度",
    ],
    defaultDuration: 10,
    defaultDifficulty: "4组",
  },
  {
    code: "path_treasure",
    name: "路径寻宝",
    clinicalPurpose: "训练执行力、路线规划和目标保持，可辅助观察计划能力变化。",
    patientInstruction: "根据提示规划路线，按顺序找到目标位置。",
    trainingTargets: ["思维训练", "executive", "planning"],
    tags: [
      "思维训练",
      "purpose:risk_assessment",
      "purpose:intervention",
      "风险评估辅助",
      "干预训练",
      "执行力",
      "路径规划",
      "低强度",
    ],
    defaultDuration: 6,
    defaultDifficulty: "2级",
  },
] as const;

const games = [
  ...extraPlanVarietyGames,
  ...browserPoseGameDefinitions.map((game) => ({
    code: game.code,
    name: game.name,
    clinicalPurpose: game.clinicalPurpose,
    patientInstruction: game.patientInstruction,
    trainingTargets: game.trainingTargets,
    tags: game.tags,
    defaultDuration: game.defaultDuration,
    defaultDifficulty: game.defaultDifficulty,
  })),
];
const planPurposePreviewLabels = ["风险评估辅助", "干预训练"];
type PatientLibraryGame = (typeof games)[number];
type PatientGameCategory = "思维训练" | "运动训练";
const patientGameCategories: PatientGameCategory[] = ["思维训练", "运动训练"];

export function GameLibraryPage({ compact = false }: { compact?: boolean } = {}) {
  return (
    <section className="grid gap-5" aria-label="训练游戏库">
      {!compact ? (
        <div className="grid gap-2">
          <StatusBadge status="ready">训练项目</StatusBadge>
          <h2 className="text-3xl font-black text-[var(--ink-strong)]">训练游戏库</h2>
          <p className="max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
            这里展示医生可安排的康复训练项目。每个项目都围绕具体训练目标、训练说明和时长难度组织，便于患者理解本次练习内容。
          </p>
          <div className="flex flex-wrap gap-2" aria-label="训练用途">
            {planPurposePreviewLabels.map((label) => (
              <span
                key={label}
                className="rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] px-3 py-1 text-xs font-black text-[var(--ink-soft)]"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-5">
        {categorySections.map((section) => (
          <section key={section.category} className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-2xl font-black text-[var(--ink-strong)]">
                {section.category}
              </h3>
              <span className="text-sm font-black text-[var(--ink-soft)]">
                {section.games.length} 项
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {section.games.map((game) => (
                <PatientGameLibraryCard key={game.code} game={game} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

const categorySections = groupPatientGamesByCategory(games);

function groupPatientGamesByCategory(gamesToGroup: PatientLibraryGame[]) {
  return patientGameCategories
    .map((category) => ({
      category,
      games: gamesToGroup.filter((game) =>
        patientTrainingCategoryLabel([...game.trainingTargets, ...game.tags]) === category,
      ),
    }))
    .filter((section) => section.games.length > 0);
}

function PatientGameLibraryCard({ game }: { game: PatientLibraryGame }) {
  const category = patientTrainingCategoryLabel([
    ...game.trainingTargets,
    ...game.tags,
  ]);
  const purposes = patientTrainingPurposeLabel([
    ...game.trainingTargets,
    ...game.tags,
  ]);
  const difficulty = patientTrainingDifficultyLabel(game.defaultDifficulty);
  const tags = patientTrainingTagsLabel([
    ...game.trainingTargets,
    ...game.tags,
  ]);

  return (
    <Card tone="patient" className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-2">
            {category ? (
              <span className="rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] px-3 py-1 text-xs font-black text-[var(--accent-strong)]">
                {category}
              </span>
            ) : null}
            {purposes.map((purpose) => (
              <span
                key={purpose}
                className="rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-muted)] px-3 py-1 text-xs font-black text-[var(--ink-soft)]"
              >
                {purpose}
              </span>
            ))}
          </div>
          <h3 className="text-xl font-black text-[var(--ink-strong)]">
            {game.name}
          </h3>
          <p className="mt-2 font-bold leading-7 text-[var(--ink-soft)]">
            {game.patientInstruction}
          </p>
        </div>
        <HeartPulse className="h-6 w-6 shrink-0 text-[var(--accent-strong)]" />
      </div>

      <div className="grid gap-3">
        <div className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] p-4">
          <div className="flex items-center gap-2 text-sm font-black text-[var(--accent-strong)]">
            <Activity className="h-4 w-4" />
            康复目的
          </div>
          <p className="mt-2 font-bold leading-7 text-[var(--ink-soft)]">
            {game.clinicalPurpose}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-[var(--accent-strong)]">
              <Clock3 className="h-4 w-4" />
              训练说明
            </div>
            <p className="mt-2 font-bold text-[var(--ink-soft)]">
              建议 {game.defaultDuration} 分钟
            </p>
          </div>
          <div className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-[var(--accent-strong)]">
              <Gauge className="h-4 w-4" />
              训练难度
            </div>
            <p className="mt-2 font-bold text-[var(--ink-soft)]">
              {difficulty ?? game.defaultDifficulty}
            </p>
          </div>
        </div>
      </div>

      {tags.length ? (
        <div className="flex flex-wrap gap-2" aria-label="训练目标">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-[var(--radius-control)] border border-[var(--line-subtle)] bg-[var(--surface-panel)] px-3 py-1 text-xs font-black text-[var(--ink-soft)]"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
