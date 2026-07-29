import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateMimoProviderOutcomePolicy } from "../verify-mimo-provider-outcome-policy.mjs";

function validPolicy(overrides = {}) {
  return {
    documentVersion: "mimo-provider-outcome-policy/v2",
    policy: {
      customerName: "康复中心",
      policyOwner: "运营合规负责人",
      approvedAt: "2026-07-22T10:00:00.000Z",
      legalApprovalReference: "LEGAL-2026-071",
      changeControlReference: "CAB-2026-220",
    },
    mimoUpstream: {
      idempotencySupported: true,
      idempotencyTransport: "http_header",
      idempotencyKeyName: "Idempotency-Key",
      idempotencyScopeComponents: [
        "provider_account",
        "organization",
        "operation",
        "patient",
        "actor",
        "canonical_request",
      ],
      idempotencyExpiryHours: 168,
      statusQuery: {
        mode: "provider_api_by_idempotency_key",
        queryIdentity: "idempotency_key",
        endpointOrProcedureReference: "MIMO-STATUS-API-2026-07",
        maximumAgeHours: 168,
      },
      reconciliation: {
        owner: "MiMo 账户运营负责人",
        procedureReference: "OPS-MIMO-RECONCILE-01",
        providerEscalationReference: "MIMO-SUPPORT-ESCALATION-02",
        maximumResolutionMinutes: 240,
      },
      providerEvidenceReference: "MIMO-CONTRACT-2026-07",
    },
    requestIdentity: {
      localCanonicalRequestIdRequired: true,
      uniquenessScopeComponents: [
        "organization",
        "operation",
        "patient",
        "actor",
        "canonical_request",
      ],
      sameKeyDifferentPayload: "reject_conflict_without_provider_call",
      providerKeyExpiryAction:
        "block_until_reconciled_or_approved_new_paid_request",
      newPaidRequestApproval: {
        required: true,
        authorizedRoles: ["finance_owner", "clinical_owner"],
        procedureReference: "FIN-NEW-PAID-REQUEST-03",
        maximumDecisionMinutes: 120,
      },
    },
    financialSettlement: {
      providerBillingSource: "provider_invoice",
      providerBillingEvidenceReference: "MIMO-BILLING-2026-07",
      sttDurationBilling: {
        method: "ceil_to_unit",
        unitSeconds: 1,
        evidenceReference: "MIMO-STT-BILLING-2026-07",
      },
      reservationExpiryMinutes: 30,
      reservationExpiryAction: "block_and_reconcile",
      reservationExpiryPolicyReference: "FIN-RESERVATION-01",
      chargeReleaseRule: "charge_only_after_provider_completion_confirmed",
      chargeReleasePolicyReference: "FIN-CONFIRMED-CHARGE-01",
      automaticFinancialAdjustmentAllowed: false,
      unconfirmedOutcomeSettlement: {
        decisionRequired: true,
        owner: "财务负责人",
        policyReference: "FIN-UNCONFIRMED-OUTCOME-01",
        approvedAction: "manual_refund_decision",
        maximumDecisionMinutes: 480,
      },
    },
    unknownOutcomeHandling: {
      caseRequired: true,
      initialStatus: "blocked_pending_reconciliation",
      automaticProviderRetryAllowed: false,
      automaticNewKeyAllowed: false,
      caseOwner: "MiMo 账户运营负责人",
      escalationOwner: "临床安全负责人",
      maximumResponseMinutes: 60,
      completionConfirmedAction: "release_stored_outcome_or_clinical_review",
      completionConfirmedPolicyReference: "MIMO-CONFIRMED-OUTCOME-01",
      completionUnconfirmedAction:
        "refund_or_release_reservation_per_approved_policy",
      closureEvidenceReference: "MIMO-OUTCOME-CLOSURE-01",
    },
    resultAndAssetProtection: {
      outcome: {
        encryptionAtRestRequired: true,
        legalBasisReference: "LEGAL-OUTCOME-2026-01",
        retentionDays: 1095,
        accessRoles: ["doctor", "auditor"],
        deletion: {
          method: "scheduled_secure_deletion",
          evidenceReference: "RETENTION-OUTCOME-01",
        },
      },
      ttsAsset: {
        storageClass: "encrypted_object_storage",
        encryptionAtRestRequired: true,
        maximumBytes: 16 * 1024 * 1024,
        contentTypes: ["audio/wav"],
        legalBasisReference: "LEGAL-TTS-ASSET-2026-01",
        retentionDays: 1095,
        accessRoles: ["patient", "doctor"],
        deletion: {
          method: "scheduled_secure_deletion",
          evidenceReference: "RETENTION-TTS-01",
        },
      },
    },
    retention: {
      outcomeRetentionDays: 1095,
      ttsAssetRetentionDays: 1095,
      financialRetentionDays: 3650,
      auditRetentionDays: 3650,
      telemetryRetentionDays: 180,
      outcomePolicyReference: "RETENTION-OUTCOME-POLICY-01",
      ttsAssetPolicyReference: "RETENTION-TTS-ASSET-POLICY-01",
      financialPolicyReference: "RETENTION-FINANCIAL-POLICY-01",
      auditPolicyReference: "RETENTION-AUDIT-POLICY-01",
      telemetryPolicyReference: "RETENTION-TELEMETRY-POLICY-01",
    },
    ...overrides,
  };
}

test("MiMo provider outcome policy accepts an explicit complete P0 policy", () => {
  assert.deepEqual(
    validateMimoProviderOutcomePolicy(validPolicy()).failures,
    [],
  );
});

test("MiMo provider outcome policy accepts approved safe provider and settlement alternatives", () => {
  const base = validPolicy();
  const policy = validPolicy({
    mimoUpstream: {
      ...base.mimoUpstream,
      idempotencyTransport: "request_body",
      idempotencyKeyName: "request_id",
      statusQuery: {
        ...base.mimoUpstream.statusQuery,
        mode: "provider_support_case_by_correlation_id",
        queryIdentity: "support_case_correlation_id",
        endpointOrProcedureReference: "MIMO-SUPPORT-CASE-2026-08",
      },
    },
    financialSettlement: {
      ...base.financialSettlement,
      providerBillingSource: "prepaid_balance_statement",
      providerBillingEvidenceReference: "MIMO-PREPAID-TERMS-2026-08",
      sttDurationBilling: {
        method: "provider_reported_duration",
        unitSeconds: 60,
        evidenceReference: "MIMO-STT-DURATION-2026-08",
      },
      reservationExpiryAction: "manual_financial_case_decision",
      reservationExpiryPolicyReference: "FIN-RESERVATION-2026-08",
      chargeReleaseRule: "clinical_review_before_settlement",
      chargeReleasePolicyReference: "FIN-CLINICAL-REVIEW-2026-08",
      unconfirmedOutcomeSettlement: {
        ...base.financialSettlement.unconfirmedOutcomeSettlement,
        approvedAction: "retain_pending_manual_settlement",
      },
    },
    unknownOutcomeHandling: {
      ...base.unknownOutcomeHandling,
      completionConfirmedAction: "require_clinical_review_before_release",
      completionConfirmedPolicyReference: "CLINICAL-REVIEW-2026-08",
      completionUnconfirmedAction: "close_after_manual_case_decision",
    },
    resultAndAssetProtection: {
      ...base.resultAndAssetProtection,
      ttsAsset: {
        ...base.resultAndAssetProtection.ttsAsset,
        storageClass: "encrypted_database_blob",
        contentTypes: ["audio/ogg"],
        retentionDays: 30,
      },
    },
    retention: {
      ...base.retention,
      ttsAssetRetentionDays: 30,
    },
  });

  assert.deepEqual(validateMimoProviderOutcomePolicy(policy).failures, []);
});

test("MiMo provider outcome policy fails closed on unsupported idempotency, status lookup, and reconciliation gaps", () => {
  const policy = validPolicy({
    mimoUpstream: {
      ...validPolicy().mimoUpstream,
      idempotencySupported: false,
      idempotencyScopeComponents: [
        "provider_account",
        "organization",
        "operation",
        "canonical_request",
      ],
      statusQuery: {
        ...validPolicy().mimoUpstream.statusQuery,
        mode: "provider_support_case",
      },
      reconciliation: {
        ...validPolicy().mimoUpstream.reconciliation,
        maximumResolutionMinutes: 0,
      },
    },
  });

  const failures =
    validateMimoProviderOutcomePolicy(policy).failures.join("\n");

  assert.match(failures, /mimoUpstream\.idempotencySupported/);
  assert.match(failures, /mimoUpstream\.idempotencyScopeComponents/);
  assert.match(failures, /mimoUpstream\.statusQuery\.mode/);
  assert.match(
    failures,
    /mimoUpstream\.reconciliation\.maximumResolutionMinutes/,
  );
});

test("MiMo provider outcome policy requires strict request, financial, unknown-outcome, and retention decisions", () => {
  const policy = validPolicy({
    requestIdentity: {
      ...validPolicy().requestIdentity,
      uniquenessScopeComponents: [
        "organization",
        "operation",
        "canonical_request",
      ],
      sameKeyDifferentPayload: "accept_latest_payload",
      newPaidRequestApproval: {
        ...validPolicy().requestIdentity.newPaidRequestApproval,
        required: false,
      },
    },
    financialSettlement: {
      ...validPolicy().financialSettlement,
      providerBillingSource: "",
      sttDurationBilling: {
        method: "",
        unitSeconds: 0,
        evidenceReference: "",
      },
      reservationExpiryAction: "",
      automaticFinancialAdjustmentAllowed: true,
      unconfirmedOutcomeSettlement: {
        ...validPolicy().financialSettlement.unconfirmedOutcomeSettlement,
        decisionRequired: false,
        owner: "",
      },
    },
    unknownOutcomeHandling: {
      ...validPolicy().unknownOutcomeHandling,
      automaticProviderRetryAllowed: true,
      automaticNewKeyAllowed: true,
      maximumResponseMinutes: 0,
    },
    resultAndAssetProtection: {
      ...validPolicy().resultAndAssetProtection,
      outcome: {
        ...validPolicy().resultAndAssetProtection.outcome,
        encryptionAtRestRequired: false,
        retentionDays: 180,
      },
      ttsAsset: {
        ...validPolicy().resultAndAssetProtection.ttsAsset,
        storageClass: "",
        encryptionAtRestRequired: false,
        maximumBytes: 0,
        contentTypes: ["not a media type"],
        retentionDays: 180,
      },
    },
    retention: {
      ...validPolicy().retention,
      outcomeRetentionDays: 1095,
      telemetryRetentionDays: 0,
    },
  });

  const failures =
    validateMimoProviderOutcomePolicy(policy).failures.join("\n");

  assert.match(failures, /sameKeyDifferentPayload/);
  assert.match(failures, /requestIdentity\.uniquenessScopeComponents/);
  assert.match(failures, /newPaidRequestApproval\.required/);
  assert.match(failures, /providerBillingSource/);
  assert.match(failures, /sttDurationBilling\.method/);
  assert.match(failures, /reservationExpiryAction/);
  assert.match(failures, /automaticFinancialAdjustmentAllowed/);
  assert.match(failures, /unconfirmedOutcomeSettlement\.decisionRequired/);
  assert.match(failures, /unconfirmedOutcomeSettlement\.owner/);
  assert.match(failures, /automaticProviderRetryAllowed/);
  assert.match(failures, /automaticNewKeyAllowed/);
  assert.match(failures, /maximumResponseMinutes/);
  assert.match(failures, /outcome\.encryptionAtRestRequired/);
  assert.match(failures, /ttsAsset\.storageClass/);
  assert.match(failures, /ttsAsset\.encryptionAtRestRequired/);
  assert.match(failures, /ttsAsset\.maximumBytes/);
  assert.match(failures, /ttsAsset\.contentTypes/);
  assert.match(failures, /telemetryRetentionDays/);
  assert.match(failures, /outcome\.retentionDays.*outcomeRetentionDays/);
});

test("MiMo provider outcome policy rejects unknown fields and forbidden non-production markers", () => {
  const policy = validPolicy({
    unknownOutcomeHandling: {
      ...validPolicy().unknownOutcomeHandling,
      caseOwner: "unknown",
      retryMode: "fallback",
    },
    waiverReason: "demo only",
  });

  const failures =
    validateMimoProviderOutcomePolicy(policy).failures.join("\n");

  assert.match(failures, /\$\.waiverReason 不是允许字段/);
  assert.match(failures, /unknownOutcomeHandling\.retryMode 不是允许字段/);
  assert.match(failures, /禁止标记/);
});

test("MiMo provider outcome policy rejects its unfilled customer template", () => {
  const template = JSON.parse(
    readFileSync(
      "docs/templates/mimo-provider-outcome-policy.template.json",
      "utf8",
    ),
  );

  const failures =
    validateMimoProviderOutcomePolicy(template).failures.join("\n");

  assert.match(failures, /占位符/);
  assert.match(failures, /idempotencyExpiryHours/);
  assert.match(failures, /retention\.telemetryRetentionDays/);
});

test("MiMo provider outcome policy CLI accepts a complete customer policy", () => {
  const directory = mkdtempSync(
    join(tmpdir(), "mimo-provider-outcome-policy-"),
  );
  const policyPath = join(directory, "policy.json");
  writeFileSync(policyPath, `${JSON.stringify(validPolicy(), null, 2)}\n`);

  const result = spawnSync(
    process.execPath,
    ["scripts/verify-mimo-provider-outcome-policy.mjs", "--", policyPath],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /校验通过/);
});
