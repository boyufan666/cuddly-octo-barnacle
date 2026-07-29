"use client";

import { FileCheck2, Gamepad2 } from "lucide-react";
import { FormEvent } from "react";
import type {
  GameContent,
  UpdateGameContentStatusRequest,
} from "@/types/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import type {
  GameContentCreateFormState,
  UnityBuildFormState,
} from "./admin-governance-forms";

type TrainingContentGovernanceProps = {
  canManageGames: boolean;
  canPublishGames: boolean;
  form: GameContentCreateFormState;
  gameContents?: GameContent[];
  isCreating: boolean;
  isUpdatingStatus: boolean;
  isUpdatingUnityBuild: boolean;
  onChange: <K extends keyof GameContentCreateFormState>(
    field: K,
    value: GameContentCreateFormState[K],
  ) => void;
  onCreateGameContent: (form: GameContentCreateFormState) => Promise<void>;
  onUnityBuildFormChange: <K extends keyof UnityBuildFormState>(
    field: K,
    value: UnityBuildFormState[K],
  ) => void;
  onUpdateGameContentStatus: (
    gameContentId: string,
    status: UpdateGameContentStatusRequest["status"],
  ) => Promise<void>;
  onUpdateUnityBuild: (form: UnityBuildFormState) => Promise<void>;
  unityBuildForm: UnityBuildFormState;
};

const runtimeOptions: Array<[GameContent["runtimeType"], string]> = [
  ["unity_webgl", "外部训练资源"],
  ["browser_pose_canvas", "浏览器体感"],
  ["cognitive_web", "认知训练"],
];

export function TrainingContentGovernance({
  canManageGames,
  canPublishGames,
  form,
  gameContents,
  isCreating,
  isUpdatingStatus,
  isUpdatingUnityBuild,
  onChange,
  onCreateGameContent,
  onUnityBuildFormChange,
  onUpdateGameContentStatus,
  onUpdateUnityBuild,
  unityBuildForm,
}: TrainingContentGovernanceProps) {
  const gameContentsUnavailable = gameContents === undefined;
  const games = gameContents ?? [];
  const releasedGames = games.filter(isReleasedGameContent);
  const pendingGames = games.filter((game) => !isReleasedGameContent(game));

  return (
    <div className="grid gap-4">
      <Card tone="governance">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <StatusBadge status="ready">内容治理</StatusBadge>
            <h3 className="mt-4 text-xl font-black text-[var(--ink-strong)]">
              训练内容管理
            </h3>
            <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-soft)]">
              管理训练内容状态、计划标签、输入权限、评分指标和发布范围。
            </p>
          </div>
          <FileCheck2
            aria-hidden="true"
            className="h-6 w-6 text-[var(--accent-strong)]"
          />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <SummaryPill label="正式内容" value={gameContentsUnavailable ? "未加载" : `${releasedGames.length} 个`} />
          <SummaryPill label="待处理内容" value={gameContentsUnavailable ? "未加载" : `${pendingGames.length} 个`} />
          <SummaryPill label="内容总数" value={gameContentsUnavailable ? "未加载" : `${games.length} 个`} />
        </div>
        {gameContentsUnavailable ? (
          <p className="mt-4 rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 text-sm font-bold text-[var(--warning)]">
            训练内容未加载，暂时无法显示内容统计。
          </p>
        ) : null}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <GameContentCreatePanel
          canManageGames={canManageGames}
          canPublishGames={canPublishGames}
          form={form}
          isBusy={isCreating}
          onChange={onChange}
          onCreateGameContent={onCreateGameContent}
        />
        <UnityBuildManagementPanel
          canManageGames={canManageGames}
          canPublishGames={canPublishGames}
          form={unityBuildForm}
          gameContents={gameContents}
          isBusy={isUpdatingUnityBuild}
          isUpdatingStatus={isUpdatingStatus}
          onChange={onUnityBuildFormChange}
          onUpdateGameContentStatus={onUpdateGameContentStatus}
          onUpdateUnityBuild={onUpdateUnityBuild}
        />
      </div>
    </div>
  );
}

function GameContentCreatePanel({
  canManageGames,
  canPublishGames,
  form,
  isBusy,
  onChange,
  onCreateGameContent,
}: {
  canManageGames: boolean;
  canPublishGames: boolean;
  form: GameContentCreateFormState;
  isBusy: boolean;
  onChange: <K extends keyof GameContentCreateFormState>(
    field: K,
    value: GameContentCreateFormState[K],
  ) => void;
  onCreateGameContent: (form: GameContentCreateFormState) => Promise<void>;
}) {
  const isInlineRuntime =
    form.runtimeType === "browser_pose_canvas" || form.runtimeType === "cognitive_web";
  const canSubmit =
    canManageGames &&
    (!isInlineRuntime || canPublishGames) &&
    form.code.trim().length > 0 &&
    form.name.trim().length > 0 &&
    (!isInlineRuntime || form.gameVersion.trim().length > 0) &&
    form.trainingTargetsText.trim().length > 0 &&
    form.tagsText.trim().length > 0 &&
    form.defaultDuration.trim().length > 0 &&
    form.defaultDifficulty.trim().length > 0 &&
    form.supportsCamera !== "" &&
    form.supportsMicrophone !== "" &&
    form.supportedInputModesText.trim().length > 0 &&
    form.requiredMetricsText.trim().length > 0;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isBusy) return;
    void onCreateGameContent(form);
  }

  return (
    <Card tone="governance" className="min-w-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <StatusBadge status={canManageGames ? "pending" : "review"}>
            新建训练内容
          </StatusBadge>
          <h4 className="mt-4 text-lg font-black text-[var(--ink-strong)]">
            训练项目与计划标签
          </h4>
        </div>
        <Gamepad2
          aria-hidden="true"
          className="h-5 w-5 text-[var(--accent-strong)]"
        />
      </div>
      {!canManageGames ? (
        <p className="mt-4 rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 text-sm font-bold leading-6 text-[var(--warning)]">
          当前账号没有训练内容管理权限。
        </p>
      ) : null}
      <form onSubmit={submit}>
        <fieldset
          className="mt-5 grid gap-4 disabled:opacity-60"
          disabled={!canManageGames || isBusy}
        >
          <TextInput label="训练内容编码" value={form.code} onChange={(value) => onChange("code", value)} />
          <TextInput label="训练内容名称" value={form.name} onChange={(value) => onChange("name", value)} />
          <SelectInput
            label="训练运行方式"
            value={form.runtimeType}
            onChange={(value) =>
              onChange("runtimeType", value as GameContentCreateFormState["runtimeType"])
            }
            options={runtimeOptions}
          />
          <TextInput label={isInlineRuntime ? "训练版本号" : "训练版本号（发布时填写）"} value={form.gameVersion} onChange={(value) => onChange("gameVersion", value)} />
          <TextInput label="默认时长（分钟）" value={form.defaultDuration} onChange={(value) => onChange("defaultDuration", value)} />
          <TextInput label="默认难度" value={form.defaultDifficulty} onChange={(value) => onChange("defaultDifficulty", value)} />
          <TextInput label="训练目标" value={form.trainingTargetsText} onChange={(value) => onChange("trainingTargetsText", value)} />
          <TextInput label="适用标签" value={form.tagsText} onChange={(value) => onChange("tagsText", value)} />
          <SelectInput
            label="是否需要摄像头"
            value={form.supportsCamera}
            onChange={(value) =>
              onChange("supportsCamera", value as GameContentCreateFormState["supportsCamera"])
            }
            options={[["", "请选择"], ["true", "是"], ["false", "否"]]}
          />
          <SelectInput
            label="是否需要麦克风"
            value={form.supportsMicrophone}
            onChange={(value) =>
              onChange("supportsMicrophone", value as GameContentCreateFormState["supportsMicrophone"])
            }
            options={[["", "请选择"], ["true", "是"], ["false", "否"]]}
          />
          <TextInput label="训练采集方式" value={form.supportedInputModesText} onChange={(value) => onChange("supportedInputModesText", value)} />
          <TextAreaInput label="训练结果指标配置" value={form.requiredMetricsText} onChange={(value) => onChange("requiredMetricsText", value)} />
        </fieldset>
        {isInlineRuntime && !canPublishGames ? (
          <p className="mt-4 text-sm font-bold text-[var(--danger)]">
            当前账号没有训练发布权限，不能创建已发布的平台内置训练内容。
          </p>
        ) : null}
        <Button
          className="mt-5 w-full"
          disabled={!canSubmit}
          isLoading={isBusy}
          type="submit"
        >
          创建训练内容
        </Button>
      </form>
    </Card>
  );
}

function UnityBuildManagementPanel({
  canManageGames,
  canPublishGames,
  form,
  gameContents,
  isBusy,
  isUpdatingStatus,
  onChange,
  onUpdateGameContentStatus,
  onUpdateUnityBuild,
}: {
  canManageGames: boolean;
  canPublishGames: boolean;
  form: UnityBuildFormState;
  gameContents?: GameContent[];
  isBusy: boolean;
  isUpdatingStatus: boolean;
  onChange: <K extends keyof UnityBuildFormState>(
    field: K,
    value: UnityBuildFormState[K],
  ) => void;
  onUpdateGameContentStatus: (
    gameContentId: string,
    status: UpdateGameContentStatusRequest["status"],
  ) => Promise<void>;
  onUpdateUnityBuild: (form: UnityBuildFormState) => Promise<void>;
}) {
  const gameContentsUnavailable = gameContents === undefined;
  const games = gameContents ?? [];
  const configurableGames = games.filter((game) => game.runtimeType === "unity_webgl");
  const selectedGame = configurableGames.find((game) => game.id === form.gameContentId);
  const requiredMetricsConfigured = isJsonArrayText(form.requiredMetricsText);
  const releaseRequirementsMet =
    form.buildStatus !== "released" ||
    (form.manifestUrl.trim().length > 0 &&
      form.buildBaseUrl.trim().length > 0 &&
      form.releaseChannel === "production" &&
      requiredMetricsConfigured);
  const canSubmit =
    canManageGames &&
    Boolean(selectedGame) &&
    form.gameVersion.trim().length > 0 &&
    form.bridgeProtocolVersion === "1.0.0" &&
    releaseRequirementsMet &&
    (form.buildStatus !== "released" || canPublishGames);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isBusy) return;
    void onUpdateUnityBuild(form);
  }

  return (
    <Card tone="governance" className="min-w-0">
      <StatusBadge status={canManageGames ? "pending" : "review"}>
        训练资源管理
      </StatusBadge>
      <h4 className="mt-4 text-lg font-black text-[var(--ink-strong)]">
        资源配置与上下架
      </h4>
      <div className="mt-5 grid gap-3">
        {gameContentsUnavailable ? (
          <p className="rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-5 text-center text-sm font-bold text-[var(--warning)]">
            训练内容未加载，暂时无法显示或配置训练资源。
          </p>
        ) : games.length ? (
          games.map((game) => {
            const isConfigurable = game.runtimeType === "unity_webgl";
            return (
              <article
                key={game.id}
                className={cn(
                  "rounded-[var(--radius-card)] border p-4",
                  form.gameContentId === game.id
                    ? "border-[var(--accent-strong)] bg-[var(--accent-soft)]"
                    : "border-[var(--line-subtle)] bg-[var(--surface-panel)]",
                )}
              >
                <button
                  className="w-full text-left disabled:cursor-not-allowed"
                  disabled={!isConfigurable}
                  onClick={() => onChange("gameContentId", game.id)}
                  type="button"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-base font-black text-[var(--ink-strong)]">
                      {game.name}
                    </strong>
                    <StatusBadge status={isReleasedGameContent(game) ? "complete" : "pending"}>
                      {gameContentStatusLabel(game.status)} · {gameBuildStatusLabel(game.buildStatus)}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-sm font-bold text-[var(--ink-soft)]">
                    {runtimeLabel(game.runtimeType)} · {game.code}
                  </p>
                </button>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["active", "inactive", "archived"] as const).map((status) => (
                    <Button
                      key={status}
                      disabled={!canManageGames || isUpdatingStatus || game.status === status}
                      intent="secondary"
                      isLoading={isUpdatingStatus}
                      onClick={() => void onUpdateGameContentStatus(game.id, status)}
                      size="sm"
                    >
                      {gameStatusActionLabel(status)}
                    </Button>
                  ))}
                </div>
              </article>
            );
          })
        ) : (
          <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-muted)] p-5 text-center text-sm font-bold text-[var(--ink-subtle)]">
            暂无训练内容。请先创建训练内容。
          </p>
        )}
      </div>
      <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-muted)] p-4">
        <p className="text-sm font-black text-[var(--accent-strong)]">
          来源/许可说明
        </p>
        <dl className="mt-3 grid gap-2 text-sm font-bold text-[var(--ink-soft)]">
          <div className="flex flex-wrap gap-2">
            <dt className="text-[var(--ink-subtle)]">浏览器体感引擎</dt>
            <dd>engine:phaser_canvas</dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="text-[var(--ink-subtle)]">体感模型来源</dt>
            <dd>sensing:mediapipe_pose</dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="text-[var(--ink-subtle)]">前端运行许可</dt>
            <dd>license:MIT</dd>
          </div>
        </dl>
      </div>
      <form onSubmit={submit}>
        <fieldset
          className="mt-5 grid gap-4 disabled:opacity-60"
          disabled={!canManageGames || isBusy || !selectedGame}
        >
          <TextInput label="训练资源地址" value={form.manifestUrl} onChange={(value) => onChange("manifestUrl", value)} />
          <TextInput label="资源文件目录" value={form.buildBaseUrl} onChange={(value) => onChange("buildBaseUrl", value)} />
          <TextInput label="训练资源版本" value={form.gameVersion} onChange={(value) => onChange("gameVersion", value)} />
          <SelectInput
            label="资源状态"
            value={form.buildStatus}
            onChange={(value) =>
              onChange("buildStatus", value as UnityBuildFormState["buildStatus"])
            }
            options={[
              ["pending_assets", "待上传资源"],
              ["validating", "校验中"],
              ["released", "已发布"],
              ["rejected", "已驳回"],
            ]}
          />
          <SelectInput
            label="发布通道"
            value={form.releaseChannel}
            onChange={(value) =>
              onChange("releaseChannel", value as UnityBuildFormState["releaseChannel"])
            }
            options={[
              ["development", "试运行"],
              ["staging", "上线前复核"],
              ["production", "正式使用"],
            ]}
          />
          <TextInput label="训练采集方式" value={form.supportedInputModesText} onChange={(value) => onChange("supportedInputModesText", value)} />
          <TextAreaInput label="训练结果指标配置" value={form.requiredMetricsText} onChange={(value) => onChange("requiredMetricsText", value)} />
        </fieldset>
        {form.buildStatus === "released" && !canPublishGames ? (
          <p className="mt-4 text-sm font-bold text-[var(--danger)]">
            当前账号没有发布权限，不能发布训练资源。
          </p>
        ) : null}
        <Button
          className="mt-5 w-full"
          disabled={!canSubmit}
          isLoading={isBusy}
          type="submit"
        >
          {form.buildStatus === "released" ? "发布训练资源" : "保存资源配置"}
        </Button>
      </form>
    </Card>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-[var(--line-subtle)] pt-3">
      <p className="text-xs font-black text-[var(--ink-subtle)]">{label}</p>
      <p className="mt-1 text-lg font-black text-[var(--ink-strong)]">{value}</p>
    </div>
  );
}

function TextInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <input
        className="mt-2 min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-panel)] px-3 text-sm font-bold text-[var(--ink-strong)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function SelectInput({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <select
        className="mt-2 min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-panel)] px-3 text-sm font-bold text-[var(--ink-strong)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextAreaInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <textarea
        className="mt-2 min-h-28 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-panel)] px-3 py-3 text-sm font-bold leading-6 text-[var(--ink-strong)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function isReleasedGameContent(game: GameContent) {
  return game.status === "active" && game.buildStatus === "released";
}

function isJsonArrayText(value: string) {
  try {
    return Array.isArray(JSON.parse(value));
  } catch {
    return false;
  }
}

function runtimeLabel(value: GameContent["runtimeType"]) {
  if (value === "unity_webgl") return "Unity WebGL";
  if (value === "browser_pose_canvas") return "浏览器体感";
  if (value === "cognitive_web") return "认知训练";
  return value;
}

function gameContentStatusLabel(value: GameContent["status"]) {
  if (value === "active") return "启用";
  if (value === "inactive") return "下架";
  if (value === "archived") return "归档";
  return value;
}

function gameBuildStatusLabel(value: GameContent["buildStatus"]) {
  if (value === "released") return "已发布";
  if (value === "validating") return "校验中";
  if (value === "rejected") return "已驳回";
  return "待上传";
}

function gameStatusActionLabel(value: UpdateGameContentStatusRequest["status"]) {
  if (value === "active") return "启用";
  if (value === "inactive") return "下架";
  return "归档";
}
