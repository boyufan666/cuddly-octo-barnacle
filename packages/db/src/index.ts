export { PrismaClient } from "@prisma/client";
export {
  SENSITIVE_BACKFILL_TABLES,
  backfillSensitiveEncryption,
  requireSensitiveBackfillKey,
  runSensitiveEncryptionBackfillCli,
} from "./backfill-sensitive-encryption";
export type {
  SensitiveBackfillGroup,
  SensitiveBackfillKeyOptions,
  SensitiveBackfillPrisma,
  SensitiveBackfillSummary,
  SensitiveBackfillTable,
} from "./backfill-sensitive-encryption";
export {
  ARGON2ID_PARAMETERS,
  CREDENTIAL_PASSWORD_MAX_LENGTH,
  CREDENTIAL_PASSWORD_MIN_LENGTH,
  CredentialPasswordPolicyError,
  hashCredential,
  validateCredentialPassword,
  verifyCredential,
} from "./credential-security";
export {
  SENSITIVE_ENCRYPTION_MAX_CIPHERTEXT_BYTES,
  createPhoneLookupHmac,
  decryptSensitiveJson,
  encryptSensitiveJson,
} from "./sensitive-encryption";
export type {
  SensitiveEncryptionAad,
  SensitiveEncryptionEnvelope,
  SensitiveEncryptionKey,
} from "./sensitive-encryption";
export type {
  AiAnalysisRecord,
  AssessmentRecord,
  AuditLog,
  CaregiverRelation,
  ConsentRecord,
  GameContent,
  MotionMetric,
  PatientProfile,
  RehabPlan,
  RehabPlanItem,
  RoleDefinition,
  TrainingResult,
  TrainingSession,
  User,
  UserRoleBinding,
} from "@prisma/client";
