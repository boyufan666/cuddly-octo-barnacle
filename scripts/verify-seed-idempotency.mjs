import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const dbPackageUrl = new URL("../packages/db/package.json", import.meta.url);
const dbRequire = createRequire(fileURLToPath(dbPackageUrl));
const { PrismaClient } = dbRequire("@prisma/client");

const prisma = new PrismaClient();
const seedMedicalRecordNo = "SEED-ALZ-0001";

try {
  const snapshot = await readSeedSnapshot();
  if (!snapshot.seedPatient) {
    throw new Error("Seed patient is missing; run pnpm db:seed before verifier.");
  }
  console.log(JSON.stringify(snapshot, null, 2));
} finally {
  await prisma.$disconnect();
}

async function readSeedSnapshot() {
  const seedPatient = await prisma.patientProfile.findFirst({
    where: {
      user: { account: "patient001" },
      healthMetrics: {
        path: ["medicalRecordNo"],
        equals: seedMedicalRecordNo,
      },
    },
    select: { id: true },
  });
  if (!seedPatient) return { seedPatient: false };
  const where = { patientId: seedPatient.id };
  return {
    seedPatient: true,
    medicalRecordNo: seedMedicalRecordNo,
    consentRecords: await prisma.consentRecord.count({ where }),
    assessmentRecords: await prisma.assessmentRecord.count({ where }),
    riskGradeRecords: await prisma.riskGradeRecord.count({ where }),
    aiAnalysisRecords: await prisma.aiAnalysisRecord.count({ where }),
    rehabPlans: await prisma.rehabPlan.count({ where }),
    currentRehabPlans: await prisma.rehabPlan.count({
      where: { ...where, status: "active", isCurrent: true },
    }),
    planAdjustmentRecords: await prisma.planAdjustmentRecord.count({
      where: { rehabPlan: where },
    }),
    trainingSessions: await prisma.trainingSession.count({ where }),
    trainingResults: await prisma.trainingResult.count({
      where: { session: where },
    }),
  };
}
