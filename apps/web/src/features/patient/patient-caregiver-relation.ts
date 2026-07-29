import type { CaregiverScope } from "@/types/api";
import type { PatientCaregiverBindingFormState } from "./PatientProfilePage";

export function buildCaregiverRelationPayload(
  form: PatientCaregiverBindingFormState,
) {
  return {
    caregiverAccount: form.caregiverAccount.trim(),
    relation: form.relation.trim(),
    scope: {
      summary: form.summary,
      reminders: form.reminders,
      progress: form.progress,
      rawAssessment: false,
      planEdit: false,
    } satisfies CaregiverScope,
  };
}
