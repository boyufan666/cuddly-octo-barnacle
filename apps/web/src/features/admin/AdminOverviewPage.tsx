"use client";

import type {
  AdminDashboardResponse,
  AuditLog,
  CollectionCondition,
  CollectionProtocol,
  GameContent,
  PatientProfile,
  RegistrationRequest,
  RehabPlan,
  TrainingRecordsResponse,
} from "@/types/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { TrainingReadiness } from "@/features/training-runtime/types";
import {
  type AdminGovernanceActions,
  type AdminGovernanceBusyState,
  type AdminGovernanceFormHandlers,
  type AdminGovernanceForms,
  type AdminGovernancePermissions,
} from "./admin-governance-actions";
import {
  AccountReviewPanel,
  CaregiverAccountCreatePanel,
} from "./AccountReviewPanel";
import { CollectionConditionGovernance } from "./CollectionConditionGovernance";
import { DesensitizedExportPanel } from "./DesensitizedExportPanel";
import { OperationConfigPanel } from "./OperationConfigPanel";
import { SecurityAuditPage } from "./SecurityAuditPage";
import { StatisticsQueryPanel } from "./StatisticsQueryPanel";
import { TrainingContentGovernance } from "./TrainingContentGovernance";
import { TrainingQualityEvidenceSection } from "./TrainingQualityEvidenceSection";

export type AdminWorkspaceId = "accounts" | "content" | "config" | "audit";

type AdminOverviewPageProps = {
  actions: AdminGovernanceActions;
  activeWorkspace: AdminWorkspaceId;
  auditLogs?: AuditLog[];
  busy: AdminGovernanceBusyState;
  collectionConditions?: CollectionCondition[];
  collectionProtocols?: CollectionProtocol[];
  currentPlan?: RehabPlan | null;
  dashboard?: AdminDashboardResponse;
  formHandlers: AdminGovernanceFormHandlers;
  forms: AdminGovernanceForms;
  gameContents?: GameContent[];
  patient?: PatientProfile;
  permissions: AdminGovernancePermissions;
  readiness: TrainingReadiness;
  registrationRequests?: RegistrationRequest[];
  trainingRecords?: TrainingRecordsResponse;
};

const adminWorkspaceCopy: Record<
  AdminWorkspaceId,
  { eyebrow: string; title: string; subtitle: string }
> = {
  accounts: {
    eyebrow: "账号",
    title: "账号治理",
    subtitle: "处理账号开通审核和家属账号创建，权限不足时只展示已加载状态。",
  },
  content: {
    eyebrow: "内容",
    title: "内容治理",
    subtitle: "维护训练内容、方案库发布状态和训练方案可引用范围。",
  },
  config: {
    eyebrow: "配置",
    title: "配置治理",
    subtitle: "查看运行就绪摘要，维护正式采集条件和采集协议。",
  },
  audit: {
    eyebrow: "审计",
    title: "安全审计",
    subtitle: "查询统计、审计日志、脱敏导出和训练质控材料。",
  },
};

export function AdminOverviewPage({
  actions,
  activeWorkspace,
  auditLogs,
  busy,
  collectionConditions,
  collectionProtocols,
  currentPlan,
  dashboard,
  formHandlers,
  forms,
  gameContents,
  patient,
  permissions,
  readiness,
  registrationRequests,
  trainingRecords,
}: AdminOverviewPageProps) {
  const copy = adminWorkspaceCopy[activeWorkspace];

  return (
    <section className="min-w-0">
      <p className="text-xs font-black text-[var(--accent-strong)]">
        {copy.eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-black text-[var(--ink-strong)] md:text-3xl">
        {copy.title}
      </h2>
      <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-[var(--ink-soft)] md:text-base md:leading-7">
        {copy.subtitle}
      </p>

      <div className="mt-6 grid gap-6" data-testid="admin-governance-workspace">
        {activeWorkspace === "accounts" ? (
          <section id="admin-account-governance">
            <SectionHeader
              title="账号治理"
              description="处理账号开通审核和家属账号创建，权限不足时只展示已加载状态。"
            />
            <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <AccountReviewPanel
                requests={registrationRequests}
                onReviewRegistrationRequest={
                  actions.onReviewRegistrationRequest
                }
                isBusy={busy.reviewRegistrationRequest}
                canReview={permissions.canCreateCaregiver}
              />
              <CaregiverAccountCreatePanel
                form={forms.caregiverAccount}
                onChange={formHandlers.onCaregiverAccountFormChange}
                onCreateCaregiverAccount={actions.onCreateCaregiverAccount}
                isBusy={busy.createCaregiver}
                canCreateCaregiver={permissions.canCreateCaregiver}
              />
            </div>
          </section>
        ) : null}

        {activeWorkspace === "content" ? (
          <section id="admin-content-governance">
            <SectionHeader
              title="内容治理"
              description="维护训练内容、方案库发布状态和训练方案可引用范围。"
            />
            <PlanLibraryReleaseSummary
              currentPlan={currentPlan}
              gameContents={gameContents}
            />
            <TrainingContentGovernance
              gameContents={gameContents}
              form={forms.gameContentCreate}
              onChange={formHandlers.onGameContentCreateFormChange}
              onCreateGameContent={actions.onCreateGameContent}
              unityBuildForm={forms.unityBuild}
              onUnityBuildFormChange={formHandlers.onUnityBuildFormChange}
              onUpdateUnityBuild={actions.onUpdateUnityBuild}
              onUpdateGameContentStatus={actions.onUpdateGameContentStatus}
              isCreating={busy.createGameContent}
              isUpdatingStatus={busy.updateGameContentStatus}
              isUpdatingUnityBuild={busy.updateUnityBuild}
              canManageGames={permissions.canManageGames}
              canPublishGames={permissions.canPublishGames}
            />
          </section>
        ) : null}

        {activeWorkspace === "config" ? (
          <section id="admin-config-governance">
            <SectionHeader
              title="配置治理"
              description="查看运行就绪摘要，维护正式采集条件和采集协议。"
            />
            <div className="mt-4 grid gap-4">
              <RuntimeReadinessSummary readiness={readiness} />
              <OperationConfigPanel
                gameContents={gameContents}
                collectionConditions={collectionConditions}
                collectionProtocols={collectionProtocols}
              />
              <CollectionConditionGovernance
                gameContents={gameContents}
                collectionConditions={collectionConditions}
                collectionProtocols={collectionProtocols}
                conditionForm={forms.collectionCondition}
                onConditionFormChange={
                  formHandlers.onCollectionConditionFormChange
                }
                onCreateCollectionCondition={
                  actions.onCreateCollectionCondition
                }
                protocolForm={forms.collectionProtocol}
                onProtocolFormChange={
                  formHandlers.onCollectionProtocolFormChange
                }
                onCreateCollectionProtocol={actions.onCreateCollectionProtocol}
                isCreatingCondition={busy.createCollectionCondition}
                isCreatingProtocol={busy.createCollectionProtocol}
                canManageGames={permissions.canManageGames}
              />
            </div>
          </section>
        ) : null}

        {activeWorkspace === "audit" ? (
          <section id="admin-security-governance">
            <SectionHeader
              title="安全审计"
              description={
                permissions.canExportData && permissions.canReadAuditLogs
                  ? "查询审计日志、生成脱敏导出，并管理训练质控材料。"
                  : "查询审计日志，并按权限管理训练质控材料。"
              }
            />
            <div className="mt-4 grid gap-4">
              <StatisticsQueryPanel dashboard={dashboard} />
              {permissions.canExportData && permissions.canReadAuditLogs ? (
                <DesensitizedExportPanel
                  form={forms.dataExport}
                  onChange={formHandlers.onDataExportFormChange}
                  onExportData={actions.onExportData}
                  isExporting={busy.exportData}
                  canExportAuditLogs={true}
                  canExportData={true}
                />
              ) : null}
              <SecurityAuditPage
                auditLogs={auditLogs}
                filters={forms.filters}
                onFiltersChange={formHandlers.onFiltersChange}
                onRefreshAuditLogs={actions.onRefreshAuditLogs}
                isLoading={busy.auditLogs}
                canReadAuditLogs={permissions.canReadAuditLogs}
              />
              {permissions.canManageQualityEvidence ? (
                <TrainingQualityEvidenceSection
                  patient={patient}
                  currentPlan={currentPlan}
                  trainingRecords={trainingRecords}
                  auditLogs={auditLogs}
                  readiness={readiness}
                  evidenceForm={forms.browserPoseEvidence}
                  onEvidenceFormChange={
                    formHandlers.onBrowserPoseEvidenceFormChange
                  }
                  onEvidenceFormPrefill={
                    formHandlers.onBrowserPoseEvidenceFormPrefill
                  }
                  unityEvidenceForm={forms.unityEvidence}
                  onUnityEvidenceFormChange={
                    formHandlers.onUnityEvidenceFormChange
                  }
                />
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}

function SectionHeader({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div>
      <StatusBadge status="review">{title}</StatusBadge>
      <h3 className="mt-3 text-xl font-black text-[var(--ink-strong)]">
        {title}
      </h3>
      <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-[var(--ink-soft)]">
        {description}
      </p>
    </div>
  );
}

function PlanLibraryReleaseSummary({
  currentPlan,
  gameContents,
}: {
  currentPlan?: RehabPlan | null;
  gameContents?: GameContent[];
}) {
  const gameContentsUnavailable = gameContents === undefined;
  const games = gameContents ?? [];
  const releasedGameIds = new Set(
    games
      .filter(
        (game) => game.status === "active" && game.buildStatus === "released",
      )
      .map((game) => game.id),
  );
  const planItems = currentPlan?.items ?? [];
  const releasedPlanItems = planItems.filter((item) =>
    releasedGameIds.has(item.gameContentId),
  );
  const releaseLabel = gameContentsUnavailable
    ? "训练内容未加载"
    : currentPlan
      ? `${releasedPlanItems.length}/${planItems.length} 项可发布`
      : "待选择方案";

  return (
    <div className="mt-4 rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <StatusBadge status={currentPlan ? "ready" : "review"}>
            方案库发布状态
          </StatusBadge>
          <h4 className="mt-3 text-lg font-black text-[var(--ink-strong)]">
            方案引用状态
          </h4>
          <p className="mt-2 text-sm font-bold leading-6 text-[var(--ink-soft)]">
            {gameContentsUnavailable
              ? "训练内容未加载，暂时无法判断方案引用状态。"
              : currentPlan
                ? `${currentPlan.planName} 当前可引用 ${releaseLabel}。`
                : "选择患者后可查看当前方案引用的训练内容发布状态。"}
          </p>
        </div>
        <span className="text-lg font-black text-[var(--ink-strong)]">
          {releaseLabel}
        </span>
      </div>
    </div>
  );
}

function RuntimeReadinessSummary({
  readiness,
}: {
  readiness: TrainingReadiness;
}) {
  const cameraReady = readiness.cameraPermission === "granted";
  const poseReady = readiness.poseRuntimeStatus === "ready";

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line-subtle)] bg-[var(--surface-paper)] p-5">
      <StatusBadge status={cameraReady && poseReady ? "ready" : "review"}>
        运行就绪摘要
      </StatusBadge>
      <h4 className="mt-3 text-lg font-black text-[var(--ink-strong)]">
        训练运行就绪
      </h4>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ReadinessCell
          label="摄像头授权"
          value={
            cameraReady ? "已就绪" : readinessLabel(readiness.cameraPermission)
          }
        />
        <ReadinessCell
          label="姿态识别"
          value={
            poseReady ? "已就绪" : readinessLabel(readiness.poseRuntimeStatus)
          }
        />
      </div>
    </div>
  );
}

function ReadinessCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-[var(--line-subtle)] pt-3">
      <p className="text-xs font-black text-[var(--ink-subtle)]">{label}</p>
      <p className="mt-1 text-lg font-black text-[var(--ink-strong)]">
        {value}
      </p>
    </div>
  );
}

function readinessLabel(value: TrainingReadiness[keyof TrainingReadiness]) {
  if (value === "requesting" || value === "loading") return "检查中";
  if (value === "denied" || value === "error") return "需处理";
  return "待检查";
}
