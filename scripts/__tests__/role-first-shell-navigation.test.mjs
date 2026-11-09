import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));

test("app page is a thin role workspace entry", async () => {
  const page = await readFile(
    join(rootDir, "apps/web/src/app/page.tsx"),
    "utf8",
  );
  const workspace = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const roleNavigation = await readFile(
    join(rootDir, "apps/web/src/features/session/role-navigation.ts"),
    "utf8",
  );
  const roleSession = await readFile(
    join(rootDir, "apps/web/src/features/session/useRoleSession.ts"),
    "utf8",
  );
  const roleData = await readFile(
    join(rootDir, "apps/web/src/features/session/useRoleData.ts"),
    "utf8",
  );

  assert.ok(
    page.split("\n").length < 1800,
    "page.tsx must be a thin app entry",
  );
  assert.match(page, /from ["']@\/features\/session\/role-workspace["']/);
  assert.match(page, /<RoleWorkspace \/>/);
  assert.match(workspace, /export function RoleWorkspace/);
  assert.match(workspace, /from ["']@\/features\/session\/role-navigation["']/);
  assert.match(workspace, /from ["']@\/features\/session\/useRoleSession["']/);
  assert.match(workspace, /from ["']@\/features\/session\/useRoleData["']/);
  assert.match(workspace, /useRoleSession\(/);
  assert.match(workspace, /useRoleData\(/);
  assert.match(
    workspace,
    /activeRoleDataTokenRef\s*=\s*useRef<string \| null>\(null\)/,
  );
  assert.match(
    workspace,
    /clearAuthenticatedState[\s\S]*activeRoleDataTokenRef\.current\s*=\s*null[\s\S]*clearRoleData\(status, message\)/,
    "clearing authenticated state must synchronously invalidate stale role data loads before data reset",
  );
  assert.doesNotMatch(
    workspace.match(
      /const clearAuthenticatedState = useCallback\(([\s\S]*?)\n\s*const handleAuthenticated/,
    )?.[1] ?? "",
    /setData\(\{\}\)/,
    "workspace cleanup must use role-data cleanup so optional panel errors are cleared",
  );
  assert.doesNotMatch(
    workspace,
    /const \[session,\s*setSession\]\s*=\s*useState<LoginResponse \| null>/,
  );
  assert.doesNotMatch(
    workspace,
    /const \[data,\s*setData\]\s*=\s*useState<AppData>/,
  );
  assert.match(roleNavigation, /patientTaskNavItems/);
  assert.match(roleSession, /api\.login/);
  assert.match(roleSession, /api\.me/);
  assert.match(roleData, /api\.patient/);
  assert.match(roleData, /api\.adminDashboard/);

  assert.doesNotMatch(
    page,
    /function (TodayScreen|PrepScreen|GameScreen|ResultScreen|FamilyScreen|DoctorScreen|AdminScreen|SecurityScreen)\b/,
  );
  assert.doesNotMatch(
    page,
    /const (patientTaskNavItems|doctorNavItems|adminNavItems|caregiverNavItems)\b/,
  );
  assert.doesNotMatch(
    page,
    /function (buildGameContentCreatePayload|buildUnityBuildPayload|buildCollectionConditionPayload)\b/,
  );
  assert.doesNotMatch(
    page,
    /function (GlassCard|PrimaryButton|DashboardShell|FieldLine|SelectField)\b/,
  );
  assert.doesNotMatch(
    page,
    /const (GlassCard|PrimaryButton|ScreenGrid)\s*=\s*function\b/,
  );
});

test("role navigation exposes only business entries for each role", async () => {
  const roleNavigation = await readFile(
    join(rootDir, "apps/web/src/features/session/role-navigation.ts"),
    "utf8",
  );
  const roleShell = await readFile(
    join(rootDir, "apps/web/src/components/layout/RoleShell.tsx"),
    "utf8",
  );
  const patientNav = sliceBetween(
    roleNavigation,
    "patientTaskNavItems",
    "doctorNavItems",
  );
  const doctorNav = sliceBetween(
    roleNavigation,
    "doctorNavItems",
    "adminNavItems",
  );
  const adminNav = sliceBetween(
    roleNavigation,
    "adminNavItems",
    "caregiverNavItems",
  );
  const caregiverNav = sliceBetween(
    roleNavigation,
    "caregiverNavItems",
    "roleHome",
  );

  for (const label of ["今日", "训练", "记录", "我的"]) {
    assert.match(patientNav, new RegExp(label), `patient nav missing ${label}`);
  }
  for (const label of ["患者", "评估", "计划", "准备", "复核"]) {
    assert.match(doctorNav, new RegExp(label), `doctor nav missing ${label}`);
  }
  for (const label of ["账号", "内容", "配置", "审计"]) {
    assert.match(adminNav, new RegExp(label), `admin nav missing ${label}`);
  }
  for (const label of ["照护", "进展", "提醒", "我的"]) {
    assert.match(
      caregiverNav,
      new RegExp(label),
      `caregiver nav missing ${label}`,
    );
  }

  assert.doesNotMatch(
    patientNav + caregiverNav,
    /运营|安全审计|配置治理|Unity|Provider|采集协议/,
  );
  assert.doesNotMatch(
    doctorNav,
    /患者队列|评估复核|计划管理|训练复核|Provider|Endpoint|manifest|导出治理|验收/,
  );
  assert.match(doctorNav, /id:\s*"preparationManagement"/);
  assert.match(doctorNav, /label:\s*"准备"/);
  assert.match(doctorNav, /screenId:\s*"plan"/);
  assert.doesNotMatch(
    adminNav,
    /账号治理|内容治理|配置治理|安全审计|供应商治理|导出治理|功能演示|技术验收/,
  );
  assert.match(roleShell, /export function RoleShell/);
  assert.match(roleShell, /patientLikeShell/);
});

test("role shell and layout sources stay minimal premium without demo or raw styling", async () => {
  const roleNavigation = await readFile(
    join(rootDir, "apps/web/src/features/session/role-navigation.ts"),
    "utf8",
  );
  const shellSources = await Promise.all(
    [
      "apps/web/src/components/layout/RoleShell.tsx",
      "apps/web/src/components/layout/AppShell.tsx",
      "apps/web/src/components/layout/PatientTaskLayout.tsx",
      "apps/web/src/components/layout/WorkbenchLayout.tsx",
      "apps/web/src/components/layout/GovernanceLayout.tsx",
    ].map((path) => readFile(join(rootDir, path), "utf8")),
  );
  const combinedShell = shellSources.join("\n");

  for (const label of [
    "今日",
    "训练",
    "记录",
    "我的",
    "患者",
    "评估",
    "计划",
    "准备",
    "复核",
    "账号",
    "内容",
    "配置",
    "审计",
    "照护",
    "进展",
    "提醒",
  ]) {
    assert.match(
      roleNavigation,
      new RegExp(label),
      `navigation missing ${label}`,
    );
  }
  assert.doesNotMatch(
    roleNavigation,
    /技术验收|供应商治理|导出治理|功能演示|患者队列|评估复核|计划管理|训练复核|账号治理|内容治理|配置治理|安全审计/,
  );
  assert.doesNotMatch(
    combinedShell,
    /hero|feature-grid|marketing|验收材料|能力展示/i,
  );
  assert.doesNotMatch(
    combinedShell,
    /md:grid-cols-4|2xl:grid-cols-\[minmax\(0,1fr\)_360px\]/,
    "role shell layouts must not keep dashboard grid shells",
  );
  assert.doesNotMatch(
    combinedShell,
    /rounded-2xl|rounded-3xl|backdrop-blur|#[0-9a-fA-F]{3,8}/,
  );
  assert.doesNotMatch(
    combinedShell,
    /--brand-primary|--brand-primary-strong|--brand-soft|--ink-primary|--ink-secondary|--ink-muted/,
  );
  assert.doesNotMatch(
    combinedShell,
    /\b(?:bg|text|border)-white(?:\b|\/)|bg-emerald-|bg-amber-/,
  );
  assert.match(combinedShell, /data-testid="patient-task-nav"/);
  assert.match(combinedShell, /safe-area-inset-bottom/);
  assert.doesNotMatch(combinedShell, /\buppercase\b/);
  assert.doesNotMatch(combinedShell, /section\.description/);
  assert.doesNotMatch(combinedShell, /roleLabel[\s\S]{0,120}uppercase/);
  assert.doesNotMatch(combinedShell, /headerMeta\.title|headerMeta\.subtitle/);
  assert.match(combinedShell, /data-testid="app-nav"/);
});

test("role shell header and navigation data do not carry descriptive page chrome", async () => {
  const workspace = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const roleNavigation = await readFile(
    join(rootDir, "apps/web/src/features/session/role-navigation.ts"),
    "utf8",
  );
  const roleShell = await readFile(
    join(rootDir, "apps/web/src/components/layout/RoleShell.tsx"),
    "utf8",
  );
  const authEntryPanel = await readFile(
    join(rootDir, "apps/web/src/features/auth/AuthEntryPanel.tsx"),
    "utf8",
  );
  const layout = await readFile(
    join(rootDir, "apps/web/src/components/layout/PatientTaskLayout.tsx"),
    "utf8",
  );
  const headerMetaSource = sliceBetween(
    roleShell,
    "headerMeta:",
    "navigationSections",
  );
  const buildNavigationSource = sliceBetween(
    roleNavigation,
    "export function buildNavigationSections",
    "export function resolveRoleNavigationItems",
  );

  assert.doesNotMatch(headerMetaSource, /title|subtitle/);
  assert.doesNotMatch(workspace, /resolveShellTitle|resolveShellSubtitle/);
  assert.match(workspace, /<AuthEntryPanel/);
  assert.doesNotMatch(workspace, /function LoginScreen/);
  assert.doesNotMatch(
    authEntryPanel,
    /<ScreenGrid|WorkbenchLayout|eyebrow=|title=|subtitle=/,
  );
  assert.doesNotMatch(buildNavigationSource, /description:/);
  assert.doesNotMatch(
    roleNavigation,
    /function resolveRoleNavigationDescription/,
  );
  assert.match(
    layout,
    /bottom-\[calc\(0\.75rem\+env\(safe-area-inset-bottom\)\)\]/,
  );
});

test("desktop role navigation uses nav id for active state", async () => {
  const workspace = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const roleShell = await readFile(
    join(rootDir, "apps/web/src/components/layout/RoleShell.tsx"),
    "utf8",
  );
  const appNavigationSource = sliceBetween(
    roleShell,
    "function AppNavigation",
    "function PatientTaskNavigation",
  );

  assert.match(workspace, /activeRoleNavId/);
  assert.match(appNavigationSource, /activeNavId/);
  assert.match(appNavigationSource, /activeNavId === item\.navId/);
  assert.match(appNavigationSource, /onChange\(item\.id,\s*item\.navId\)/);
  assert.doesNotMatch(
    appNavigationSource,
    /active === item\.id \|\| active === item\.navId/,
  );
  assert.doesNotMatch(workspace, /setActiveRoleNavId\(resolvedNavId\)/);
});

test("programmatic screen changes update the role navigation highlight", async () => {
  const workspace = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const roleNavigation = await readFile(
    join(rootDir, "apps/web/src/features/session/role-navigation.ts"),
    "utf8",
  );
  const homeSource = sliceBetween(
    workspace,
    "export function RoleWorkspace()",
    "async function reloadRoleData",
  );
  const setActiveSource = sliceBetween(
    workspace,
    "const setActive = useCallback(",
    "async function reloadRoleData",
  );
  const roleNavigationChangeSource = sliceBetween(
    workspace,
    "function handleRoleNavigationChange(",
    "async function handleSelectPatient",
  );
  const resolverSource = sliceBetween(
    roleNavigation,
    "function resolveActiveRoleNavId",
    "function roleNavigationItemMatchesScreen",
  );

  assert.match(homeSource, /const \[active,\s*setActiveScreen\]/);
  assert.match(
    setActiveSource,
    /const setActive = useCallback\(\n    \(nextActive: ScreenId, nextNavId\?: RoleNavigationId\) => \{/,
  );
  assert.match(
    setActiveSource,
    /setActiveScreen\(nextActive\);\n      setActiveRoleNavId\(\n        resolveActiveRoleNavId\(\n          primaryRole,\n          nextActive,\n          nextNavId \?\? null,\n          roleNavigationItems,\n        \),\n      \);/,
  );
  assert.match(
    roleNavigationChangeSource,
    /function handleRoleNavigationChange\(\n    screen: ScreenId,\n    navId: RoleNavigationId,\n  \) \{\n    setActive\(screen, navId\);\n  \}/,
  );
  assert.doesNotMatch(homeSource, /const \[active,\s*setActive\]/);
  assert.match(resolverSource, /roleNavigationItemMatchesScreen/);
});

test("doctor workflow-only screens still map to a visible role nav item", async () => {
  const roleNavigation = await readFile(
    join(rootDir, "apps/web/src/features/session/role-navigation.ts"),
    "utf8",
  );
  const doctorNav = sliceBetween(
    roleNavigation,
    "doctorNavItems",
    "adminNavItems",
  );

  assert.match(
    doctorNav,
    /id:\s*"planManagement"[\s\S]*screenId:\s*"plan"[\s\S]*activeScreenIds:\s*\[[^\]]*"plan"[^\]]*"match"/,
    "doctor match workflow should highlight plan management",
  );
  assert.match(
    doctorNav,
    /id:\s*"preparationManagement"[\s\S]*label:\s*"准备"[\s\S]*screenId:\s*"plan"/,
    "doctor preparation workflow should have an explicit visible nav item",
  );
});

test("doctor plan confirmation and preparation stay in separate workspaces", async () => {
  const workspace = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const workspaceModel = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace-model.ts"),
    "utf8",
  );
  const doctorWorkspace = await readFile(
    join(rootDir, "apps/web/src/features/doctor/DoctorWorkspacePage.tsx"),
    "utf8",
  );
  const mapperSource = sliceBetween(
    workspaceModel,
    "export function doctorWorkspaceFromNavId",
    "export function caregiverWorkspaceSectionFromNavId",
  );
  const planBranch = sliceBetween(
    doctorWorkspace,
    '{activeWorkspace === "plan" ? (',
    '{activeWorkspace === "preparation" ? (',
  );
  const preparationBranch = sliceBetween(
    doctorWorkspace,
    '{activeWorkspace === "preparation" ? (',
    '{activeWorkspace === "review" ? (',
  );

  assert.match(doctorWorkspace, /\|\s*"preparation"/);
  assert.match(doctorWorkspace, /preparation:\s*{[\s\S]*title:\s*"准备"/);
  assert.match(
    mapperSource,
    /if \(navId === "preparationManagement"\) \{\n    return "preparation";\n  \}\n  if \(\n    navId === "planManagement" \|\|\n    activeScreen === "plan" \|\|\n    activeScreen === "match"\n  \) \{\n    return "plan";\n  \}/,
  );
  assert.ok(
    mapperSource.indexOf('"preparationManagement"') <
      mapperSource.indexOf('"planManagement"'),
    "preparation nav must be resolved before generic plan screen handling",
  );
  assert.match(
    workspace,
    /activeWorkspace=\{doctorWorkspaceFromNavId\(activeNavId, active\)\}/,
  );
  assert.match(planBranch, /<PlanEditor/);
  assert.doesNotMatch(planBranch, /DataCollectionReviewPanel/);
  assert.match(preparationBranch, /DataCollectionReviewPanel/);
  assert.doesNotMatch(preparationBranch, /<PlanEditor/);
});

test("role navigation resolver keeps caregiver task ids and admin duplicate screens explicit", async () => {
  const roleNavigation = await readFile(
    join(rootDir, "apps/web/src/features/session/role-navigation.ts"),
    "utf8",
  );
  const resolverSource = sliceBetween(
    roleNavigation,
    "function resolveRoleNavigationItems",
    "function resolveRoleNavigationTitle",
  );
  const adminNav = sliceBetween(
    roleNavigation,
    "adminNavItems",
    "caregiverNavItems",
  );
  const caregiverNav = sliceBetween(
    roleNavigation,
    "caregiverNavItems",
    "roleHome",
  );

  assert.match(resolverSource, /caregiverNavItems/);
  assert.match(resolverSource, /adminNavItems/);
  assert.match(adminNav, /id:\s*"contentGovernance"[\s\S]*screenId:\s*"admin"/);
  assert.match(adminNav, /id:\s*"operationConfig"[\s\S]*screenId:\s*"admin"/);
  for (const id of [
    'id: "family"',
    'id: "familyProgress"',
    'id: "familyAlerts"',
    'id: "familyProfile"',
  ]) {
    assert.match(
      caregiverNav,
      new RegExp(escapeRegExp(id)),
      `caregiver nav missing ${id}`,
    );
  }
  assert.doesNotMatch(caregiverNav, /href:/);
});

test("patient and caregiver layout reserve bottom navigation safe area", async () => {
  const roleShell = await readFile(
    join(rootDir, "apps/web/src/components/layout/RoleShell.tsx"),
    "utf8",
  );
  const appShell = await readFile(
    join(rootDir, "apps/web/src/components/layout/AppShell.tsx"),
    "utf8",
  );
  const layout = await readFile(
    join(rootDir, "apps/web/src/components/layout/PatientTaskLayout.tsx"),
    "utf8",
  );
  const taskNavigationSource = sliceFrom(
    roleShell,
    "function PatientTaskNavigation",
  );

  assert.match(layout, /--bottom-nav-height/);
  assert.match(layout, /safe-area-inset-bottom/);
  assert.match(layout, /min-h-0/);
  assert.match(layout, /overflow-y-auto/);
  assert.match(layout, /overscroll-contain/);
  assert.match(
    layout,
    /fixed inset-x-3 bottom-\[calc\(0\.75rem\+env\(safe-area-inset-bottom\)\)\]/,
  );
  assert.match(layout, /data-testid="patient-task-nav"/);
  assert.doesNotMatch(
    layout,
    /md:sticky|md:bottom-auto|md:top-3|md:overflow-visible|md:pb-0/,
  );
  assert.doesNotMatch(taskNavigationSource, /md:sticky|md:top-3|md:mb-4/);
  assert.match(appShell, /overflow-x-hidden/);
  assert.doesNotMatch(appShell, /overflow-hidden/);
});

test("training runtime containers are extracted from workspace orchestration", async () => {
  const workspace = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const browserSurface = await readFile(
    join(
      rootDir,
      "apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx",
    ),
    "utf8",
  );
  const unitySurface = await readFile(
    join(
      rootDir,
      "apps/web/src/features/training-runtime/UnityTrainingSurface.tsx",
    ),
    "utf8",
  );
  const runtimeStage = await readFile(
    join(
      rootDir,
      "apps/web/src/features/patient/PatientTrainingRuntimeStage.tsx",
    ),
    "utf8",
  );

  assert.doesNotMatch(workspace, /function UnityGameContainer/);
  assert.doesNotMatch(workspace, /function BrowserPoseGameContainer/);
  assert.doesNotMatch(workspace, /function BrowserPoseEvidencePanel/);
  assert.match(workspace, /<PatientTrainingRuntimeStage/);
  assert.doesNotMatch(workspace, /BrowserPoseTrainingSurface/);
  assert.doesNotMatch(workspace, /UnityTrainingSurface/);
  assert.match(runtimeStage, /BrowserPoseTrainingSurface/);
  assert.match(runtimeStage, /UnityTrainingSurface/);
  assert.match(browserSurface, /export function BrowserPoseTrainingSurface/);
  assert.match(unitySurface, /export function UnityTrainingSurface/);
  assert.doesNotMatch(browserSurface + unitySurface, /fallback|mock|demo/i);
});

test("training runtime result adapters stay out of workspace orchestration", async () => {
  const workspace = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const browserSurface = await readFile(
    join(
      rootDir,
      "apps/web/src/features/training-runtime/BrowserPoseTrainingSurface.tsx",
    ),
    "utf8",
  );
  const unitySurface = await readFile(
    join(
      rootDir,
      "apps/web/src/features/training-runtime/UnityTrainingSurface.tsx",
    ),
    "utf8",
  );
  const runtimeStage = await readFile(
    join(
      rootDir,
      "apps/web/src/features/patient/PatientTrainingRuntimeStage.tsx",
    ),
    "utf8",
  );

  assert.match(workspace, /<PatientTrainingRuntimeStage/);
  assert.doesNotMatch(workspace, /function renderPatientTrainingStage/);
  assert.doesNotMatch(workspace, /isUnityTrainingResultCandidate/);
  assert.doesNotMatch(workspace, /parseUnityTrainingResultBridgeEvent/);
  assert.doesNotMatch(workspace, /window\.addEventListener\("message"/);
  assert.doesNotMatch(workspace, /function applyUnityBridgeResultToForm/);
  assert.match(runtimeStage, /export function PatientTrainingRuntimeStage/);
  assert.match(
    unitySurface,
    /onResultReady:\s*\(payload:\s*SubmitTrainingResultRequest\)\s*=>\s*void/,
  );
  assert.match(unitySurface, /parseUnityTrainingResultBridgeEvent/);
  assert.match(unitySurface, /window\.addEventListener\("message"/);
  assert.match(browserSurface, /const capturedRunToken = runTokenRef\.current/);
  assert.match(browserSurface, /runTokenRef\.current !== capturedRunToken/);
  assert.match(
    browserSurface,
    /return \(\) => \{[\s\S]*runTokenRef\.current \+= 1;[\s\S]*stopBrowserPoseRuntime\(runtimeRef, animationRef/,
    "browser pose runtime must invalidate the active run and stop resources on unmount",
  );
});

test("session success handlers refetch persisted state before applying local success state", async () => {
  const workspace = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );
  const aiConversationActions = await readFile(
    join(rootDir, "apps/web/src/features/session/ai-conversation-actions.ts"),
    "utf8",
  );

  assertSourceOrder(
    sliceBetween(
      aiConversationActions,
      "async function handleCreateAssessmentFromAiConversation",
      "async function handleReviewAiConversationFromDoctor",
    ),
    "api.createAssessment(payload)",
    "await reloadRoleData",
  );
  assertSourceOrder(
    sliceBetween(
      aiConversationActions,
      "async function handleCreateAssessmentFromAiConversation",
      "async function handleReviewAiConversationFromDoctor",
    ),
    "await reloadRoleData",
    "return assessment",
  );
  assertSourceOrder(
    sliceBetween(
      aiConversationActions,
      "async function handleReviewAiConversationFromDoctor",
      "  return {",
    ),
    "api.reviewAiConversation(sessionId, payload)",
    "await reloadRoleData",
  );
  assertSourceOrder(
    sliceBetween(
      aiConversationActions,
      "async function handleReviewAiConversationFromDoctor",
      "  return {",
    ),
    "await reloadRoleData",
    "return reviewed",
  );
  assertSourceOrder(
    sliceBetween(
      workspace,
      "async function handleCreateCaregiverAccount",
      "async function handleCreateAiAssessmentDraft",
    ),
    "await reloadRoleData",
    "setCaregiverAccountForm(emptyCaregiverAccountForm)",
  );
  assertSourceOrder(
    sliceBetween(
      workspace,
      "async function handleConfirmPlan",
      "function handleEnterTrainingPrep",
    ),
    "await reloadRoleData",
    "setPendingPlan(null)",
  );
  assertSourceOrder(
    sliceBetween(
      workspace,
      "async function handleRecommendPlan",
      "async function handleConfirmPlan",
    ),
    "await reloadRoleData",
    "setPendingPlan(plan)",
  );
  assertSourceOrder(
    sliceBetween(
      workspace,
      "async function handleBindCaregiver",
      "async function handleRevokeCaregiver",
    ),
    "await reloadRoleData(refreshedSession",
    "setCaregiverBindingForm(emptyCaregiverBindingForm)",
  );
  assertSourceOrder(
    sliceBetween(
      workspace,
      "async function handleSubmitTrainingReview",
      "return (",
    ),
    "await reloadRoleData",
    "setTrainingReviewForm(emptyTrainingReviewForm)",
  );
  assertSourceOrder(
    sliceBetween(
      workspace,
      "async function handleCreateCollectionCondition",
      "async function handleCreateCollectionProtocol",
    ),
    "api.collectionProtocols",
    "setCollectionConditionForm(emptyCollectionConditionForm)",
  );
  assertSourceOrder(
    sliceBetween(
      workspace,
      "async function handleExportData",
      "async function handleCreateRegistrationRequest",
    ),
    "await fetchAdminAuditLogs",
    "downloadExportedFile(exported)",
  );
});

test("login failure status from session orchestration is surfaced in rendered shell", async () => {
  const workspace = await readFile(
    join(rootDir, "apps/web/src/features/session/role-workspace.tsx"),
    "utf8",
  );

  assert.match(workspace, /dataError:\s*sessionDataError/);
  assert.match(workspace, /dataStatus:\s*sessionDataStatus/);
  assert.match(
    workspace,
    /const displayedDataError = session\n    \? dataError\n    : \(sessionDataError \?\? dataError\);/,
  );
  assert.match(
    workspace,
    /const displayedDataStatus = session \? dataStatus : sessionDataStatus;/,
  );
  assert.match(workspace, /setActionStatus\(null\)/);
  assert.match(workspace, /dataError=\{displayedDataError\}/);
  assert.match(workspace, /dataStatus=\{displayedDataStatus\}/);
});

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

function sliceFrom(source, startMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);
  return source.slice(start);
}

function assertSourceOrder(source, before, after) {
  const beforeIndex = source.indexOf(before);
  assert.notEqual(beforeIndex, -1, `Missing source marker: ${before}`);
  const afterIndex = source.indexOf(after);
  assert.notEqual(afterIndex, -1, `Missing source marker: ${after}`);
  assert.ok(
    beforeIndex < afterIndex,
    `Expected ${before} to appear before ${after}`,
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
