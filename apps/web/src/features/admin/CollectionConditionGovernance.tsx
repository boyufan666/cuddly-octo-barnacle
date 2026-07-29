"use client";

import { Database, ShieldCheck } from "lucide-react";
import type {
  CollectionCondition,
  CollectionProtocol,
  ConsentType,
  FormalTrainingRuntime,
  GameContent,
} from "@/types/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";

export type CollectionConditionGovernanceFormState = {
  code: string;
  name: string;
  description: string;
  environmentText: string;
  deviceRequirementsText: string;
  taskParametersText: string;
  qualityRulesText: string;
};

export type CollectionProtocolGovernanceFormState = {
  conditionId: string;
  gameContentId: string;
  code: string;
  name: string;
  version: string;
  runtimeType: FormalTrainingRuntime;
  requiredConsentTypes: ConsentType[];
  requiredInputModesText: string;
  requiredMetricsText: string;
  conditionRulesText: string;
  samplingConfigText: string;
  qualityGateText: string;
};

type CollectionConditionGovernanceProps = {
  gameContents?: GameContent[];
  collectionConditions?: CollectionCondition[];
  collectionProtocols?: CollectionProtocol[];
  conditionForm: CollectionConditionGovernanceFormState;
  onConditionFormChange: <K extends keyof CollectionConditionGovernanceFormState>(
    field: K,
    value: CollectionConditionGovernanceFormState[K],
  ) => void;
  onCreateCollectionCondition: (
    form: CollectionConditionGovernanceFormState,
  ) => Promise<void>;
  protocolForm: CollectionProtocolGovernanceFormState;
  onProtocolFormChange: <K extends keyof CollectionProtocolGovernanceFormState>(
    field: K,
    value: CollectionProtocolGovernanceFormState[K],
  ) => void;
  onCreateCollectionProtocol: (
    form: CollectionProtocolGovernanceFormState,
  ) => Promise<void>;
  isCreatingCondition: boolean;
  isCreatingProtocol: boolean;
  canManageGames: boolean;
};

const runtimeOptions: Array<[FormalTrainingRuntime, string]> = [
  ["unity_webgl", "Unity WebGL"],
  ["browser_pose_canvas", "浏览器体感"],
  ["cognitive_web", "认知网页"],
];

const consentOptions: Array<[ConsentType, string]> = [
  ["privacy_policy", "隐私政策"],
  ["ai_processing", "AI 分析处理"],
  ["camera_capture", "摄像头采集"],
  ["microphone_capture", "麦克风采集"],
  ["caregiver_sharing", "家属共享"],
];

const inputModeOptions: Array<[string, string]> = [
  ["camera_pose", "摄像头体感"],
  ["touch", "触控输入"],
  ["keyboard", "键盘输入"],
  ["microphone", "麦克风输入"],
];

export function CollectionConditionGovernance({
  gameContents,
  collectionConditions,
  collectionProtocols,
  conditionForm,
  onConditionFormChange,
  onCreateCollectionCondition,
  protocolForm,
  onProtocolFormChange,
  onCreateCollectionProtocol,
  isCreatingCondition,
  isCreatingProtocol,
  canManageGames,
}: CollectionConditionGovernanceProps) {
  const gameContentsUnavailable = gameContents === undefined;
  const collectionConditionsUnavailable = collectionConditions === undefined;
  const collectionProtocolsUnavailable = collectionProtocols === undefined;
  const conditions = mergeCollectionConditions(
    collectionConditions,
    collectionProtocols,
  );
  const releasedGames = (gameContents ?? []).filter(isReleasedGameContent);
  const selectedGame = releasedGames.find(
    (game) => game.id === protocolForm.gameContentId,
  );
  const canCreateCondition =
    canManageGames && isCollectionConditionFormComplete(conditionForm);
  const canCreateProtocol =
    canManageGames &&
    isCollectionProtocolFormComplete(protocolForm) &&
    Boolean(
      selectedGame &&
        selectedGame.runtimeType === protocolForm.runtimeType &&
        conditions.some((condition) => condition.id === protocolForm.conditionId),
    );

  function submitCondition(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreateCondition || isCreatingCondition) return;
    void onCreateCollectionCondition(conditionForm);
  }

  function submitProtocol(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreateProtocol || isCreatingProtocol) return;
    void onCreateCollectionProtocol(protocolForm);
  }

  return (
    <Card tone="governance" className="md:col-span-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-black text-[var(--accent-strong)]">
            <Database className="h-4 w-4" aria-hidden="true" />
            正式采集条件
          </div>
          <h3 className="mt-4 text-2xl font-black text-[var(--ink-strong)]">
            采集条件与协议配置
          </h3>
          <p className="mt-2 max-w-3xl font-bold leading-7 text-[var(--ink-soft)]">
            用于定义不同训练条件下的数据收集规则。管理员先创建场地、设备、任务和质控条件，再绑定已发布训练内容生成正式采集协议。
          </p>
        </div>
        <StatusBadge status={canManageGames ? "pending" : "review"}>
          {canManageGames ? "配置会写入审计" : "当前角色只读"}
        </StatusBadge>
      </div>

      {!canManageGames ? (
        <div className="mt-5 rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 font-bold leading-7 text-[var(--warning)]">
          当前账号没有训练内容与采集配置权限。只读账号不能创建或修改采集条件。
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <form onSubmit={submitCondition} className="min-w-0 border-t border-[var(--line-subtle)] pt-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h4 className="text-xl font-black text-[var(--ink-strong)]">创建采集条件</h4>
              <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-subtle)]">
                记录训练场景、设备要求、任务参数和质量规则，不创建患者训练记录。
              </p>
            </div>
            <StatusBadge status={collectionConditionsUnavailable ? "review" : conditions.length ? "complete" : "pending"}>
              {collectionConditionsUnavailable
                ? "采集条件未加载"
                : conditions.length
                  ? `${conditions.length} 个可用条件`
                  : "待创建"}
            </StatusBadge>
          </div>
          <fieldset
            disabled={!canManageGames || isCreatingCondition}
            className="grid gap-x-4 disabled:opacity-60 md:grid-cols-2"
          >
            <FieldLine
              label="条件编码"
              value={conditionForm.code}
              onChange={(value) => onConditionFormChange("code", value)}
            />
            <FieldLine
              label="条件名称"
              value={conditionForm.name}
              onChange={(value) => onConditionFormChange("name", value)}
            />
            <FieldLine
              label="条件说明"
              value={conditionForm.description}
              onChange={(value) => onConditionFormChange("description", value)}
            />
          </fieldset>
          <div className="grid gap-x-4 md:grid-cols-2">
            <TextAreaField
              label="采集环境 JSON"
              value={conditionForm.environmentText}
              onChange={(value) => onConditionFormChange("environmentText", value)}
              readOnly={!canManageGames || isCreatingCondition}
            />
            <TextAreaField
              label="设备要求 JSON"
              value={conditionForm.deviceRequirementsText}
              onChange={(value) =>
                onConditionFormChange("deviceRequirementsText", value)
              }
              readOnly={!canManageGames || isCreatingCondition}
            />
            <TextAreaField
              label="任务参数 JSON"
              value={conditionForm.taskParametersText}
              onChange={(value) =>
                onConditionFormChange("taskParametersText", value)
              }
              readOnly={!canManageGames || isCreatingCondition}
            />
            <TextAreaField
              label="质量规则 JSON"
              value={conditionForm.qualityRulesText}
              onChange={(value) => onConditionFormChange("qualityRulesText", value)}
              readOnly={!canManageGames || isCreatingCondition}
            />
          </div>
          <Button
            className="mt-5 w-full"
            disabled={!canCreateCondition}
            isLoading={isCreatingCondition}
            type="submit"
          >
            创建采集条件
          </Button>
        </form>

        <form onSubmit={submitProtocol} className="min-w-0 border-t border-[var(--line-subtle)] pt-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h4 className="text-xl font-black text-[var(--ink-strong)]">创建采集协议</h4>
              <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-subtle)]">
                将正式采集条件绑定到已发布训练内容，作为医师创建训练准备记录的依据。
              </p>
            </div>
            <StatusBadge status={collectionProtocolsUnavailable ? "review" : collectionProtocols.length ? "complete" : "pending"}>
              {collectionProtocolsUnavailable
                ? "采集协议未加载"
                : collectionProtocols.length
                ? `${collectionProtocols.length} 个协议`
                : "待配置协议"}
            </StatusBadge>
          </div>
          <fieldset
            disabled={!canManageGames || isCreatingProtocol}
            className="grid gap-x-4 disabled:opacity-60 md:grid-cols-2"
          >
            <SelectField
              label="正式采集条件"
              value={protocolForm.conditionId}
              onChange={(value) => onProtocolFormChange("conditionId", value)}
              options={[
                ["", conditions.length ? "请选择采集条件" : "请先创建采集条件"],
                ...conditions.map((condition) => [
                  condition.id,
                  `${condition.name} · ${condition.code}`,
                ] as [string, string]),
              ]}
            />
            <SelectField
              label="已发布训练内容"
              value={protocolForm.gameContentId}
              onChange={(value) => onProtocolFormChange("gameContentId", value)}
              options={[
                ["", gameContentsUnavailable ? "训练内容未加载" : releasedGames.length ? "请选择训练内容" : "暂无已发布训练内容"],
                ...releasedGames.map((game) => [
                  game.id,
                  `${game.name} · ${runtimeLabel(game.runtimeType)}`,
                ] as [string, string]),
              ]}
            />
            <FieldLine
              label="协议编码"
              value={protocolForm.code}
              onChange={(value) => onProtocolFormChange("code", value)}
            />
            <FieldLine
              label="协议名称"
              value={protocolForm.name}
              onChange={(value) => onProtocolFormChange("name", value)}
            />
            <FieldLine
              label="协议版本"
              value={protocolForm.version}
              onChange={(value) => onProtocolFormChange("version", value)}
            />
            <SelectField
              label="运行方式"
              value={protocolForm.runtimeType}
              onChange={(value) =>
                onProtocolFormChange("runtimeType", value as FormalTrainingRuntime)
              }
              options={runtimeOptions}
            />
          </fieldset>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {consentOptions.map(([consentType, label]) => (
              <CheckLine
                key={consentType}
                label={label}
                checked={protocolForm.requiredConsentTypes.includes(consentType)}
                disabled={!canManageGames || isCreatingProtocol}
                onChange={(checked) =>
                  onProtocolFormChange(
                    "requiredConsentTypes",
                    updateSelection(
                      protocolForm.requiredConsentTypes,
                      consentType,
                      checked,
                    ),
                  )
                }
              />
            ))}
          </div>
          <TrainingInputModePicker
            label="采集输入方式"
            value={protocolForm.requiredInputModesText}
            disabled={!canManageGames || isCreatingProtocol}
            onChange={(value) =>
              onProtocolFormChange("requiredInputModesText", value)
            }
          />
          <div className="grid gap-x-4 md:grid-cols-2">
            <TextAreaField
              label="要求指标 JSON"
              value={protocolForm.requiredMetricsText}
              onChange={(value) =>
                onProtocolFormChange("requiredMetricsText", value)
              }
              readOnly={!canManageGames || isCreatingProtocol}
            />
            <TextAreaField
              label="条件规则 JSON"
              value={protocolForm.conditionRulesText}
              onChange={(value) =>
                onProtocolFormChange("conditionRulesText", value)
              }
              readOnly={!canManageGames || isCreatingProtocol}
            />
            <TextAreaField
              label="采样配置 JSON"
              value={protocolForm.samplingConfigText}
              onChange={(value) =>
                onProtocolFormChange("samplingConfigText", value)
              }
              readOnly={!canManageGames || isCreatingProtocol}
            />
            <TextAreaField
              label="质量门禁 JSON"
              value={protocolForm.qualityGateText}
              onChange={(value) => onProtocolFormChange("qualityGateText", value)}
              readOnly={!canManageGames || isCreatingProtocol}
            />
          </div>
          <GovernanceSummary
            conditionsUnavailable={collectionConditionsUnavailable}
            conditions={conditions}
            gameContentsUnavailable={gameContentsUnavailable}
            protocols={collectionProtocols ?? []}
            protocolsUnavailable={collectionProtocolsUnavailable}
            releasedGames={releasedGames}
          />
          <Button
            className="mt-5 w-full"
            disabled={!canCreateProtocol}
            isLoading={isCreatingProtocol}
            type="submit"
          >
            创建采集协议
          </Button>
        </form>
      </div>
    </Card>
  );
}

function GovernanceSummary({
  conditions,
  conditionsUnavailable,
  gameContentsUnavailable,
  protocols,
  protocolsUnavailable,
  releasedGames,
}: {
  conditions: CollectionCondition[];
  conditionsUnavailable: boolean;
  gameContentsUnavailable: boolean;
  protocols: CollectionProtocol[];
  protocolsUnavailable: boolean;
  releasedGames: GameContent[];
}) {
  return (
    <section className="mt-5 border-t border-[var(--line-subtle)] pt-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-[var(--accent-strong)]" aria-hidden="true" />
        <h4 className="font-black text-[var(--ink-strong)]">治理总览</h4>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SummaryTile label="条件状态" value={conditionsUnavailable ? "未加载" : `${conditions.length} 个条件`} />
        <SummaryTile label="协议绑定" value={protocolsUnavailable ? "未加载" : `${protocols.length} 个协议`} />
        <SummaryTile label="训练内容" value={gameContentsUnavailable ? "未加载" : `${releasedGames.length} 个已发布`} />
      </div>
      {conditionsUnavailable ? <UnavailableNotice>采集条件未加载，暂时无法显示条件状态。</UnavailableNotice> : null}
      {protocolsUnavailable ? <UnavailableNotice>采集协议未加载，暂时无法显示协议绑定。</UnavailableNotice> : null}
      {gameContentsUnavailable ? <UnavailableNotice>训练内容未加载，暂时无法显示发布状态。</UnavailableNotice> : null}
      <div className="mt-4 grid gap-3">
        {protocols.slice(0, 4).map((protocol) => (
          <div
            key={protocol.id}
            className="border-b border-[var(--line-subtle)] pb-3 last:border-b-0"
          >
            <p className="font-black text-[var(--ink-strong)]">
              {protocol.name} · {protocol.version}
            </p>
            <p className="mt-1 text-sm font-bold text-[var(--ink-subtle)]">
              {runtimeLabel(protocol.runtimeType)} · {protocol.status} · 条件 {protocol.condition?.code ?? protocol.conditionId}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function UnavailableNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-[var(--radius-card)] border border-[var(--warning-line)] bg-[var(--warning-soft)] p-4 text-sm font-bold text-[var(--warning)]">
      {children}
    </p>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-[var(--line-subtle)] pt-3">
      <p className="text-xs font-black text-[var(--ink-subtle)]">{label}</p>
      <p className="mt-1 text-lg font-black text-[var(--ink-strong)]">{value}</p>
    </div>
  );
}

function FieldLine({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-5 block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-panel)] px-3 py-3 font-mono text-sm font-bold text-[var(--ink-strong)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="mt-5 block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-panel)] px-3 py-3 text-sm font-bold text-[var(--ink-strong)] outline-none transition focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
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

function TextAreaField({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label className="mt-5 block">
      <span className="text-sm font-black text-[var(--ink-soft)]">{label}</span>
      <textarea
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        className="mt-2 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-panel)] px-3 py-3 text-sm font-bold leading-6 text-[var(--ink-strong)] outline-none transition read-only:bg-[var(--surface-muted)] read-only:text-[var(--ink-soft)] focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
      />
    </label>
  );
}

function CheckLine({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--line-subtle)] py-3 font-bold text-[var(--ink-soft)] last:border-b-0">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-[var(--accent-strong)] disabled:opacity-60"
      />
    </label>
  );
}

function TrainingInputModePicker({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const selectedModes = new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

  function toggleMode(mode: string, checked: boolean) {
    const nextModes = checked
      ? Array.from(new Set([...selectedModes, mode]))
      : Array.from(selectedModes).filter((item) => item !== mode);
    onChange(nextModes.join(", "));
  }

  return (
    <div className="mt-5">
      <p className="text-sm font-black text-[var(--ink-soft)]">{label}</p>
      <div className="mt-2 grid gap-3">
        {inputModeOptions.map(([mode, labelText]) => (
          <CheckLine
            key={mode}
            label={labelText}
            checked={selectedModes.has(mode)}
            disabled={disabled}
            onChange={(checked) => toggleMode(mode, checked)}
          />
        ))}
      </div>
      <details className="mt-3 border-t border-[var(--line-subtle)] pt-3">
        <summary className="cursor-pointer text-sm font-black text-[var(--accent-strong)]">
          高级配置：采集方式标识
        </summary>
        <input
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-panel)] px-3 font-mono text-sm font-bold text-[var(--ink-soft)] outline-none transition disabled:bg-[var(--surface-muted)] disabled:text-[var(--ink-subtle)] focus:border-[var(--accent-strong)] focus:ring-4 focus:ring-[var(--accent-strong)]/15"
        />
      </details>
    </div>
  );
}

function mergeCollectionConditions(
  localConditions?: CollectionCondition[],
  protocols?: CollectionProtocol[],
) {
  const byId = new Map<string, CollectionCondition>();
  for (const condition of localConditions ?? []) {
    byId.set(condition.id, condition);
  }
  for (const protocol of protocols ?? []) {
    if (protocol.condition) {
      byId.set(protocol.condition.id, protocol.condition);
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.code.localeCompare(b.code));
}

function isCollectionConditionFormComplete(
  form: CollectionConditionGovernanceFormState,
) {
  return Boolean(
    form.code.trim() &&
      form.name.trim() &&
      form.environmentText.trim() &&
      form.deviceRequirementsText.trim() &&
      form.taskParametersText.trim() &&
      form.qualityRulesText.trim(),
  );
}

function isCollectionProtocolFormComplete(
  form: CollectionProtocolGovernanceFormState,
) {
  return Boolean(
    form.conditionId &&
      form.gameContentId &&
      form.code.trim() &&
      form.name.trim() &&
      form.version.trim() &&
      form.requiredConsentTypes.length &&
      form.requiredInputModesText.trim() &&
      form.requiredMetricsText.trim() &&
      form.conditionRulesText.trim() &&
      form.samplingConfigText.trim() &&
      form.qualityGateText.trim(),
  );
}

function updateSelection<T>(selected: T[], value: T, checked: boolean) {
  if (checked) {
    return Array.from(new Set([...selected, value]));
  }
  return selected.filter((item) => item !== value);
}

function isReleasedGameContent(game: GameContent) {
  return game.status === "active" && game.buildStatus === "released";
}

function runtimeLabel(value: string) {
  if (value === "unity_webgl") return "Unity WebGL";
  if (value === "browser_pose_canvas") return "浏览器体感";
  if (value === "cognitive_web") return "认知网页";
  return value;
}
