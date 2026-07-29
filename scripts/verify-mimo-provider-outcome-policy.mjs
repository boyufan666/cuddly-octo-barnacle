#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const expectedDocumentVersion = "mimo-provider-outcome-policy/v2";
const maximumRetentionDays = 36_500;
const forbiddenMarkerPattern = new RegExp(
  "(^|[^a-z0-9])(m[o]ck|d[e]mo|f[a]llback|waiver|unknown|tbd|todo|sample|example|placeholder|not[ _-]?applicable)([^a-z0-9]|$)",
  "i",
);
const forbiddenMarkerLabel = [
  "m" + "ock",
  "demo",
  "fall" + "back",
  "waiver",
  "unknown",
  "TBD",
  "TODO",
  "sample",
  "example",
  "placeholder",
  "not-applicable",
].join("/");

const topLevelKeys = new Set([
  "documentVersion",
  "policy",
  "mimoUpstream",
  "requestIdentity",
  "financialSettlement",
  "unknownOutcomeHandling",
  "resultAndAssetProtection",
  "retention",
]);
const policyKeys = new Set([
  "customerName",
  "policyOwner",
  "approvedAt",
  "legalApprovalReference",
  "changeControlReference",
]);
const mimoUpstreamKeys = new Set([
  "idempotencySupported",
  "idempotencyTransport",
  "idempotencyKeyName",
  "idempotencyScopeComponents",
  "idempotencyExpiryHours",
  "statusQuery",
  "reconciliation",
  "providerEvidenceReference",
]);
const statusQueryKeys = new Set([
  "mode",
  "queryIdentity",
  "endpointOrProcedureReference",
  "maximumAgeHours",
]);
const reconciliationKeys = new Set([
  "owner",
  "procedureReference",
  "providerEscalationReference",
  "maximumResolutionMinutes",
]);
const requestIdentityKeys = new Set([
  "localCanonicalRequestIdRequired",
  "uniquenessScopeComponents",
  "sameKeyDifferentPayload",
  "providerKeyExpiryAction",
  "newPaidRequestApproval",
]);
const newPaidRequestApprovalKeys = new Set([
  "required",
  "authorizedRoles",
  "procedureReference",
  "maximumDecisionMinutes",
]);
const financialSettlementKeys = new Set([
  "providerBillingSource",
  "providerBillingEvidenceReference",
  "sttDurationBilling",
  "reservationExpiryMinutes",
  "reservationExpiryAction",
  "reservationExpiryPolicyReference",
  "chargeReleaseRule",
  "chargeReleasePolicyReference",
  "automaticFinancialAdjustmentAllowed",
  "unconfirmedOutcomeSettlement",
]);
const sttDurationBillingKeys = new Set([
  "method",
  "unitSeconds",
  "evidenceReference",
]);
const unconfirmedOutcomeSettlementKeys = new Set([
  "decisionRequired",
  "owner",
  "policyReference",
  "approvedAction",
  "maximumDecisionMinutes",
]);
const unknownOutcomeHandlingKeys = new Set([
  "caseRequired",
  "initialStatus",
  "automaticProviderRetryAllowed",
  "automaticNewKeyAllowed",
  "caseOwner",
  "escalationOwner",
  "maximumResponseMinutes",
  "completionConfirmedAction",
  "completionConfirmedPolicyReference",
  "completionUnconfirmedAction",
  "closureEvidenceReference",
]);
const resultAndAssetProtectionKeys = new Set(["outcome", "ttsAsset"]);
const outcomeProtectionKeys = new Set([
  "encryptionAtRestRequired",
  "legalBasisReference",
  "retentionDays",
  "accessRoles",
  "deletion",
]);
const ttsAssetProtectionKeys = new Set([
  "storageClass",
  "encryptionAtRestRequired",
  "maximumBytes",
  "contentTypes",
  "legalBasisReference",
  "retentionDays",
  "accessRoles",
  "deletion",
]);
const deletionKeys = new Set(["method", "evidenceReference"]);
const retentionKeys = new Set([
  "outcomeRetentionDays",
  "ttsAssetRetentionDays",
  "financialRetentionDays",
  "auditRetentionDays",
  "telemetryRetentionDays",
  "outcomePolicyReference",
  "ttsAssetPolicyReference",
  "financialPolicyReference",
  "auditPolicyReference",
  "telemetryPolicyReference",
]);
const requiredUpstreamScopeComponents = new Set([
  "provider_account",
  "organization",
  "operation",
  "patient",
  "actor",
  "canonical_request",
]);
const requiredLocalScopeComponents = new Set([
  "organization",
  "operation",
  "patient",
  "actor",
  "canonical_request",
]);

export function validateMimoProviderOutcomePolicy(policy) {
  const failures = [];

  if (!isObject(policy)) {
    return { failures: ["MiMo 调用结果政策必须是 JSON 对象。"] };
  }

  validateAllowedKeys(failures, policy, topLevelKeys, "$");
  requireEqual(
    failures,
    policy.documentVersion,
    expectedDocumentVersion,
    "documentVersion 必须为 mimo-provider-outcome-policy/v2。",
  );
  validatePolicy(failures, policy.policy);
  validateMimoUpstream(failures, policy.mimoUpstream);
  validateRequestIdentity(failures, policy.requestIdentity);
  validateFinancialSettlement(failures, policy.financialSettlement);
  validateUnknownOutcomeHandling(failures, policy.unknownOutcomeHandling);
  validateResultAndAssetProtection(failures, policy.resultAndAssetProtection);
  validateRetention(
    failures,
    policy.retention,
    policy.resultAndAssetProtection,
  );
  validateNoPlaceholders(failures, policy, "$");
  validateNoForbiddenMarkers(failures, policy, "$");

  return { failures };
}

function validatePolicy(failures, policy) {
  requireObject(failures, policy, "policy 必须是对象。");
  if (!isObject(policy)) return;
  validateAllowedKeys(failures, policy, policyKeys, "policy");
  requireString(failures, policy.customerName, "policy.customerName");
  requireString(failures, policy.policyOwner, "policy.policyOwner");
  requireIsoDateTime(failures, policy.approvedAt, "policy.approvedAt");
  requireString(
    failures,
    policy.legalApprovalReference,
    "policy.legalApprovalReference",
  );
  requireString(
    failures,
    policy.changeControlReference,
    "policy.changeControlReference",
  );
}

function validateMimoUpstream(failures, upstream) {
  requireObject(failures, upstream, "mimoUpstream 必须是对象。");
  if (!isObject(upstream)) return;
  validateAllowedKeys(failures, upstream, mimoUpstreamKeys, "mimoUpstream");
  requireTrue(
    failures,
    upstream.idempotencySupported,
    "mimoUpstream.idempotencySupported 必须为 true；没有上游幂等支持不能实施 P0 outcome/outbox。",
  );
  requireEnum(
    failures,
    upstream.idempotencyTransport,
    new Set(["http_header", "request_body", "query_parameter"]),
    "mimoUpstream.idempotencyTransport",
  );
  requireProviderFieldName(
    failures,
    upstream.idempotencyKeyName,
    "mimoUpstream.idempotencyKeyName",
  );
  requireExactStringSet(
    failures,
    upstream.idempotencyScopeComponents,
    requiredUpstreamScopeComponents,
    "mimoUpstream.idempotencyScopeComponents 必须且只能覆盖 provider account、organization、operation、patient、actor 与 canonical request。",
  );
  requirePositiveSafeInteger(
    failures,
    upstream.idempotencyExpiryHours,
    "mimoUpstream.idempotencyExpiryHours",
    8_760,
  );
  validateStatusQuery(failures, upstream.statusQuery);
  validateReconciliation(failures, upstream.reconciliation);
  requireString(
    failures,
    upstream.providerEvidenceReference,
    "mimoUpstream.providerEvidenceReference",
  );
}

function validateStatusQuery(failures, statusQuery) {
  requireObject(failures, statusQuery, "mimoUpstream.statusQuery 必须是对象。");
  if (!isObject(statusQuery)) return;
  validateAllowedKeys(
    failures,
    statusQuery,
    statusQueryKeys,
    "mimoUpstream.statusQuery",
  );
  const requiredQueryIdentityByMode = new Map([
    ["provider_api_by_idempotency_key", "idempotency_key"],
    ["provider_api_by_provider_request_id", "provider_request_id"],
    ["provider_support_case_by_correlation_id", "support_case_correlation_id"],
  ]);
  const requiredQueryIdentity = requiredQueryIdentityByMode.get(
    statusQuery.mode,
  );
  if (requiredQueryIdentity === undefined) {
    failures.push(
      "mimoUpstream.statusQuery.mode 必须是按幂等键、供应商请求 ID 或支持工单关联 ID 查询的已批准方式。",
    );
  } else {
    requireEqual(
      failures,
      statusQuery.queryIdentity,
      requiredQueryIdentity,
      "mimoUpstream.statusQuery.queryIdentity 必须与 statusQuery.mode 一致。",
    );
  }
  requireString(
    failures,
    statusQuery.endpointOrProcedureReference,
    "mimoUpstream.statusQuery.endpointOrProcedureReference",
  );
  requirePositiveSafeInteger(
    failures,
    statusQuery.maximumAgeHours,
    "mimoUpstream.statusQuery.maximumAgeHours",
    8_760,
  );
}

function validateReconciliation(failures, reconciliation) {
  requireObject(
    failures,
    reconciliation,
    "mimoUpstream.reconciliation 必须是对象。",
  );
  if (!isObject(reconciliation)) return;
  validateAllowedKeys(
    failures,
    reconciliation,
    reconciliationKeys,
    "mimoUpstream.reconciliation",
  );
  requireString(
    failures,
    reconciliation.owner,
    "mimoUpstream.reconciliation.owner",
  );
  requireString(
    failures,
    reconciliation.procedureReference,
    "mimoUpstream.reconciliation.procedureReference",
  );
  requireString(
    failures,
    reconciliation.providerEscalationReference,
    "mimoUpstream.reconciliation.providerEscalationReference",
  );
  requirePositiveSafeInteger(
    failures,
    reconciliation.maximumResolutionMinutes,
    "mimoUpstream.reconciliation.maximumResolutionMinutes",
    43_200,
  );
}

function validateRequestIdentity(failures, requestIdentity) {
  requireObject(failures, requestIdentity, "requestIdentity 必须是对象。");
  if (!isObject(requestIdentity)) return;
  validateAllowedKeys(
    failures,
    requestIdentity,
    requestIdentityKeys,
    "requestIdentity",
  );
  requireTrue(
    failures,
    requestIdentity.localCanonicalRequestIdRequired,
    "requestIdentity.localCanonicalRequestIdRequired 必须为 true。",
  );
  requireExactStringSet(
    failures,
    requestIdentity.uniquenessScopeComponents,
    requiredLocalScopeComponents,
    "requestIdentity.uniquenessScopeComponents 必须且只能覆盖 organization、operation、patient、actor 与 canonical request。",
  );
  requireEqual(
    failures,
    requestIdentity.sameKeyDifferentPayload,
    "reject_conflict_without_provider_call",
    "requestIdentity.sameKeyDifferentPayload 必须精确拒绝冲突且不得外呼。",
  );
  requireEqual(
    failures,
    requestIdentity.providerKeyExpiryAction,
    "block_until_reconciled_or_approved_new_paid_request",
    "requestIdentity.providerKeyExpiryAction 必须先对账或取得新付费请求批准。",
  );
  validateNewPaidRequestApproval(
    failures,
    requestIdentity.newPaidRequestApproval,
  );
}

function validateNewPaidRequestApproval(failures, approval) {
  requireObject(
    failures,
    approval,
    "requestIdentity.newPaidRequestApproval 必须是对象。",
  );
  if (!isObject(approval)) return;
  validateAllowedKeys(
    failures,
    approval,
    newPaidRequestApprovalKeys,
    "requestIdentity.newPaidRequestApproval",
  );
  requireTrue(
    failures,
    approval.required,
    "requestIdentity.newPaidRequestApproval.required 必须为 true。",
  );
  requireStringArray(
    failures,
    approval.authorizedRoles,
    "requestIdentity.newPaidRequestApproval.authorizedRoles",
  );
  requireString(
    failures,
    approval.procedureReference,
    "requestIdentity.newPaidRequestApproval.procedureReference",
  );
  requirePositiveSafeInteger(
    failures,
    approval.maximumDecisionMinutes,
    "requestIdentity.newPaidRequestApproval.maximumDecisionMinutes",
    43_200,
  );
}

function validateFinancialSettlement(failures, settlement) {
  requireObject(failures, settlement, "financialSettlement 必须是对象。");
  if (!isObject(settlement)) return;
  validateAllowedKeys(
    failures,
    settlement,
    financialSettlementKeys,
    "financialSettlement",
  );
  requireString(
    failures,
    settlement.providerBillingSource,
    "financialSettlement.providerBillingSource",
  );
  requireString(
    failures,
    settlement.providerBillingEvidenceReference,
    "financialSettlement.providerBillingEvidenceReference",
  );
  validateSttDurationBilling(failures, settlement.sttDurationBilling);
  requirePositiveSafeInteger(
    failures,
    settlement.reservationExpiryMinutes,
    "financialSettlement.reservationExpiryMinutes",
    43_200,
  );
  requireString(
    failures,
    settlement.reservationExpiryAction,
    "financialSettlement.reservationExpiryAction",
  );
  requireString(
    failures,
    settlement.chargeReleaseRule,
    "financialSettlement.chargeReleaseRule",
  );
  requireString(
    failures,
    settlement.reservationExpiryPolicyReference,
    "financialSettlement.reservationExpiryPolicyReference",
  );
  requireString(
    failures,
    settlement.chargeReleasePolicyReference,
    "financialSettlement.chargeReleasePolicyReference",
  );
  requireFalse(
    failures,
    settlement.automaticFinancialAdjustmentAllowed,
    "financialSettlement.automaticFinancialAdjustmentAllowed 必须为 false；任何扣费、退款、额度释放或贷项调整都必须按经批准的案件决策执行。",
  );
  validateUnconfirmedOutcomeSettlement(
    failures,
    settlement.unconfirmedOutcomeSettlement,
  );
}

function validateSttDurationBilling(failures, billing) {
  requireObject(
    failures,
    billing,
    "financialSettlement.sttDurationBilling 必须是对象。",
  );
  if (!isObject(billing)) return;
  validateAllowedKeys(
    failures,
    billing,
    sttDurationBillingKeys,
    "financialSettlement.sttDurationBilling",
  );
  requireString(
    failures,
    billing.method,
    "financialSettlement.sttDurationBilling.method",
  );
  requirePositiveSafeInteger(
    failures,
    billing.unitSeconds,
    "financialSettlement.sttDurationBilling.unitSeconds",
    3_600,
  );
  requireString(
    failures,
    billing.evidenceReference,
    "financialSettlement.sttDurationBilling.evidenceReference",
  );
}

function validateUnconfirmedOutcomeSettlement(failures, settlement) {
  requireObject(
    failures,
    settlement,
    "financialSettlement.unconfirmedOutcomeSettlement 必须是对象。",
  );
  if (!isObject(settlement)) return;
  validateAllowedKeys(
    failures,
    settlement,
    unconfirmedOutcomeSettlementKeys,
    "financialSettlement.unconfirmedOutcomeSettlement",
  );
  requireTrue(
    failures,
    settlement.decisionRequired,
    "financialSettlement.unconfirmedOutcomeSettlement.decisionRequired 必须为 true。",
  );
  requireString(
    failures,
    settlement.owner,
    "financialSettlement.unconfirmedOutcomeSettlement.owner",
  );
  requireString(
    failures,
    settlement.policyReference,
    "financialSettlement.unconfirmedOutcomeSettlement.policyReference",
  );
  requireString(
    failures,
    settlement.approvedAction,
    "financialSettlement.unconfirmedOutcomeSettlement.approvedAction",
  );
  requirePositiveSafeInteger(
    failures,
    settlement.maximumDecisionMinutes,
    "financialSettlement.unconfirmedOutcomeSettlement.maximumDecisionMinutes",
    43_200,
  );
}

function validateUnknownOutcomeHandling(failures, handling) {
  requireObject(failures, handling, "unknownOutcomeHandling 必须是对象。");
  if (!isObject(handling)) return;
  validateAllowedKeys(
    failures,
    handling,
    unknownOutcomeHandlingKeys,
    "unknownOutcomeHandling",
  );
  requireTrue(
    failures,
    handling.caseRequired,
    "unknownOutcomeHandling.caseRequired 必须为 true。",
  );
  requireEqual(
    failures,
    handling.initialStatus,
    "blocked_pending_reconciliation",
    "unknownOutcomeHandling.initialStatus 必须精确为 blocked_pending_reconciliation。",
  );
  requireFalse(
    failures,
    handling.automaticProviderRetryAllowed,
    "unknownOutcomeHandling.automaticProviderRetryAllowed 必须为 false。",
  );
  requireFalse(
    failures,
    handling.automaticNewKeyAllowed,
    "unknownOutcomeHandling.automaticNewKeyAllowed 必须为 false。",
  );
  requireString(
    failures,
    handling.caseOwner,
    "unknownOutcomeHandling.caseOwner",
  );
  requireString(
    failures,
    handling.escalationOwner,
    "unknownOutcomeHandling.escalationOwner",
  );
  requirePositiveSafeInteger(
    failures,
    handling.maximumResponseMinutes,
    "unknownOutcomeHandling.maximumResponseMinutes",
    43_200,
  );
  requireString(
    failures,
    handling.completionConfirmedAction,
    "unknownOutcomeHandling.completionConfirmedAction",
  );
  requireString(
    failures,
    handling.completionUnconfirmedAction,
    "unknownOutcomeHandling.completionUnconfirmedAction",
  );
  requireString(
    failures,
    handling.completionConfirmedPolicyReference,
    "unknownOutcomeHandling.completionConfirmedPolicyReference",
  );
  requireString(
    failures,
    handling.closureEvidenceReference,
    "unknownOutcomeHandling.closureEvidenceReference",
  );
}

function validateResultAndAssetProtection(failures, protection) {
  requireObject(failures, protection, "resultAndAssetProtection 必须是对象。");
  if (!isObject(protection)) return;
  validateAllowedKeys(
    failures,
    protection,
    resultAndAssetProtectionKeys,
    "resultAndAssetProtection",
  );
  validateOutcomeProtection(failures, protection.outcome);
  validateTtsAssetProtection(failures, protection.ttsAsset);
}

function validateOutcomeProtection(failures, outcome) {
  requireObject(
    failures,
    outcome,
    "resultAndAssetProtection.outcome 必须是对象。",
  );
  if (!isObject(outcome)) return;
  validateAllowedKeys(
    failures,
    outcome,
    outcomeProtectionKeys,
    "resultAndAssetProtection.outcome",
  );
  requireTrue(
    failures,
    outcome.encryptionAtRestRequired,
    "resultAndAssetProtection.outcome.encryptionAtRestRequired 必须为 true。",
  );
  requireString(
    failures,
    outcome.legalBasisReference,
    "resultAndAssetProtection.outcome.legalBasisReference",
  );
  requireRetentionDays(
    failures,
    outcome.retentionDays,
    "resultAndAssetProtection.outcome.retentionDays",
  );
  requireStringArray(
    failures,
    outcome.accessRoles,
    "resultAndAssetProtection.outcome.accessRoles",
  );
  validateDeletion(
    failures,
    outcome.deletion,
    "resultAndAssetProtection.outcome.deletion",
  );
}

function validateTtsAssetProtection(failures, ttsAsset) {
  requireObject(
    failures,
    ttsAsset,
    "resultAndAssetProtection.ttsAsset 必须是对象。",
  );
  if (!isObject(ttsAsset)) return;
  validateAllowedKeys(
    failures,
    ttsAsset,
    ttsAssetProtectionKeys,
    "resultAndAssetProtection.ttsAsset",
  );
  requireString(
    failures,
    ttsAsset.storageClass,
    "resultAndAssetProtection.ttsAsset.storageClass",
  );
  requireTrue(
    failures,
    ttsAsset.encryptionAtRestRequired,
    "resultAndAssetProtection.ttsAsset.encryptionAtRestRequired 必须为 true。",
  );
  requirePositiveSafeInteger(
    failures,
    ttsAsset.maximumBytes,
    "resultAndAssetProtection.ttsAsset.maximumBytes",
    256 * 1024 * 1024,
  );
  requireMediaTypeArray(
    failures,
    ttsAsset.contentTypes,
    "resultAndAssetProtection.ttsAsset.contentTypes",
  );
  requireString(
    failures,
    ttsAsset.legalBasisReference,
    "resultAndAssetProtection.ttsAsset.legalBasisReference",
  );
  requireRetentionDays(
    failures,
    ttsAsset.retentionDays,
    "resultAndAssetProtection.ttsAsset.retentionDays",
  );
  requireStringArray(
    failures,
    ttsAsset.accessRoles,
    "resultAndAssetProtection.ttsAsset.accessRoles",
  );
  validateDeletion(
    failures,
    ttsAsset.deletion,
    "resultAndAssetProtection.ttsAsset.deletion",
  );
}

function validateDeletion(failures, deletion, field) {
  requireObject(failures, deletion, `${field} 必须是对象。`);
  if (!isObject(deletion)) return;
  validateAllowedKeys(failures, deletion, deletionKeys, field);
  requireString(failures, deletion.method, `${field}.method`);
  requireString(
    failures,
    deletion.evidenceReference,
    `${field}.evidenceReference`,
  );
}

function validateRetention(failures, retention, protection) {
  requireObject(failures, retention, "retention 必须是对象。");
  if (!isObject(retention)) return;
  validateAllowedKeys(failures, retention, retentionKeys, "retention");
  requireRetentionDays(
    failures,
    retention.outcomeRetentionDays,
    "retention.outcomeRetentionDays",
  );
  requireRetentionDays(
    failures,
    retention.ttsAssetRetentionDays,
    "retention.ttsAssetRetentionDays",
  );
  requireRetentionDays(
    failures,
    retention.financialRetentionDays,
    "retention.financialRetentionDays",
  );
  requireRetentionDays(
    failures,
    retention.auditRetentionDays,
    "retention.auditRetentionDays",
  );
  requireRetentionDays(
    failures,
    retention.telemetryRetentionDays,
    "retention.telemetryRetentionDays",
  );
  for (const field of [
    "outcomePolicyReference",
    "ttsAssetPolicyReference",
    "financialPolicyReference",
    "auditPolicyReference",
    "telemetryPolicyReference",
  ]) {
    requireString(failures, retention[field], `retention.${field}`);
  }

  if (isObject(protection?.outcome)) {
    requireEqual(
      failures,
      protection.outcome.retentionDays,
      retention.outcomeRetentionDays,
      "resultAndAssetProtection.outcome.retentionDays 必须与 retention.outcomeRetentionDays 一致。",
    );
  }
  if (isObject(protection?.ttsAsset)) {
    requireEqual(
      failures,
      protection.ttsAsset.retentionDays,
      retention.ttsAssetRetentionDays,
      "resultAndAssetProtection.ttsAsset.retentionDays 必须与 retention.ttsAssetRetentionDays 一致。",
    );
  }
}

function requireObject(failures, value, message) {
  if (!isObject(value)) failures.push(message);
}

function requireString(failures, value, field) {
  if (typeof value !== "string" || !value.trim()) {
    failures.push(`${field} 不能为空。`);
  }
}

function requireStringArray(failures, value, field) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    failures.push(`${field} 必须是非空字符串数组。`);
  }
}

function requireExactStringSet(failures, value, requiredValues, message) {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    failures.push(message);
    return;
  }
  if (
    value.length !== requiredValues.size ||
    new Set(value).size !== value.length ||
    value.some((item) => !requiredValues.has(item))
  ) {
    failures.push(message);
  }
}

function requireMediaTypeArray(failures, value, field) {
  requireStringArray(failures, value, field);
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (
      typeof item !== "string" ||
      !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(item)
    ) {
      failures.push(`${field} 必须仅包含明确的 IANA media type。`);
      return;
    }
  }
}

function requireProviderFieldName(failures, value, field) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value)
  ) {
    failures.push(`${field} 必须是明确的供应商幂等键字段名称。`);
  }
}

function requireTrue(failures, value, message) {
  if (value !== true) failures.push(message);
}

function requireFalse(failures, value, message) {
  if (value !== false) failures.push(message);
}

function requireEqual(failures, actual, expected, message) {
  if (actual !== expected) failures.push(message);
}

function requireEnum(failures, value, allowedValues, field) {
  if (!allowedValues.has(value)) {
    failures.push(
      `${field} 必须是 ${Array.from(allowedValues).join("、")} 之一。`,
    );
  }
}

function requirePositiveSafeInteger(
  failures,
  value,
  field,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    failures.push(`${field} 必须是范围内的正安全整数。`);
  }
}

function requireRetentionDays(failures, value, field) {
  requireIntegerRange(failures, value, 1, maximumRetentionDays, field);
}

function requireIntegerRange(failures, value, minimum, maximum, field) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    failures.push(`${field} 必须是 ${minimum} 到 ${maximum} 之间的整数。`);
  }
}

function requireIsoDateTime(failures, value, field) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    failures.push(`${field} 必须是有效的 UTC ISO 日期时间。`);
  }
}

function validateAllowedKeys(failures, value, allowedKeys, field) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      failures.push(`${field}.${key} 不是允许字段。`);
    }
  }
}

function validateNoPlaceholders(failures, value, path) {
  if (typeof value === "string") {
    if (/[<>]/.test(value)) {
      failures.push(`${path} 含占位符，必须填写经客户批准的正式值。`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateNoPlaceholders(failures, item, `${path}[${index}]`),
    );
    return;
  }
  if (isObject(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      validateNoPlaceholders(failures, nestedValue, `${path}.${key}`);
    }
  }
}

function validateNoForbiddenMarkers(failures, value, path) {
  if (typeof value === "string") {
    if (forbiddenMarkerPattern.test(value)) {
      failures.push(`${path} 含禁止标记 ${forbiddenMarkerLabel}。`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateNoForbiddenMarkers(failures, item, `${path}[${index}]`),
    );
    return;
  }
  if (isObject(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      validateNoForbiddenMarkers(failures, nestedValue, `${path}.${key}`);
    }
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cli() {
  const inputPath = process.argv.slice(2).find((arg) => arg !== "--");
  if (!inputPath) {
    console.error(
      "用法：node scripts/verify-mimo-provider-outcome-policy.mjs -- <mimo-provider-outcome-policy.json>",
    );
    process.exitCode = 1;
    return;
  }

  const resolvedPath = resolve(process.cwd(), inputPath);
  if (!existsSync(resolvedPath)) {
    console.error(`MiMo 调用结果政策文件不存在：${resolvedPath}`);
    process.exitCode = 1;
    return;
  }

  let policy;
  try {
    policy = JSON.parse(readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    console.error(`MiMo 调用结果政策不是有效 JSON：${error.message}`);
    process.exitCode = 1;
    return;
  }

  const { failures } = validateMimoProviderOutcomePolicy(policy);
  if (failures.length) {
    console.error("MiMo 调用结果政策校验失败：");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log("MiMo 调用结果政策校验通过。");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}
