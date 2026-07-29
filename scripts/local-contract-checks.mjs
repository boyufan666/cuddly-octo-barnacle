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
  "desensitized_patient_export_verified",
  "data_export_audit_log_persisted",
  "doctor_export_role_denied",
  "auditor_export_role_denied",
  "caregiver_login_verified",
  "caregiver_summary_desensitized",
  "caregiver_summary_view_audit_log_persisted",
  "caregiver_full_training_records_denied",
  "caregiver_full_record_denied_audit_log_persisted",
  "caregiver_sharing_consent_revoked",
  "revoked_caregiver_sharing_blocks_summary",
  "revoked_caregiver_summary_denied_audit_log_persisted",
  "caregiver_sharing_revoke_audit_log_persisted",
];

export function verifyCompletedContractChecks(completedChecks) {
  return requiredLocalContractChecks.filter(
    (checkName) => !completedChecks.has(checkName),
  );
}
