export const requiredLocalContractChecks = [
  "doctor_login_verified",
  "valid_result_review_rejected",
  "suspicious_result_created",
  "suspicious_result_reviewed",
  "review_fields_persisted",
  "review_preserved_quality_flags",
  "review_audit_log_persisted",
  "duplicate_review_rejected",
  "camera_consent_revoked",
  "revoked_camera_consent_blocks_training",
  "consent_revoke_audit_log_persisted",
];

export function verifyCompletedContractChecks(completedChecks) {
  return requiredLocalContractChecks.filter(
    (checkName) => !completedChecks.has(checkName),
  );
}

export function buildConsentRestoreWhere(consentIds, revokedAtByConsentId) {
  return {
    OR: Array.from(new Set(consentIds))
      .filter(Boolean)
      .map((id) => ({
        id,
        status: "revoked",
        revokedAt: revokedAtByConsentId[id],
      })),
  };
}
