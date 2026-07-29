import type { CreateRegistrationRequest } from "@/types/api";
import type { AccountRequestFormState } from "./AccountRequestPanel";

export function buildCreateRegistrationRequestPayload(
  form: AccountRequestFormState,
): CreateRegistrationRequest {
  const profile: Record<string, unknown> = {};
  const healthSummary = form.healthSummary.trim();
  if (healthSummary) {
    profile.healthSummary = healthSummary;
  }

  if (form.requestedRole === "patient") {
    const age = parseRequiredNumber(form.age, "患者年龄");
    assertNumberRange(age, 1, 120, "患者年龄必须在 1 到 120 岁之间。");
    profile.gender = form.gender.trim();
    profile.age = age;
    const caregiverName = form.caregiverName.trim();
    const caregiverPhone = form.caregiverPhone.trim();
    if (caregiverName) {
      profile.caregiverName = caregiverName;
    }
    if (caregiverPhone) {
      profile.caregiverPhone = caregiverPhone;
    }
  }

  const payload: CreateRegistrationRequest = {
    requestedRole: form.requestedRole,
    account: form.account.trim(),
    initialPassword: form.initialPassword,
    displayName: form.displayName.trim(),
  };
  const mobilePhone = form.mobilePhone.trim();
  if (mobilePhone) {
    payload.mobilePhone = mobilePhone;
  }
  if (Object.keys(profile).length) {
    payload.profile = profile;
  }
  return payload;
}

function assertNumberRange(
  value: number,
  min: number,
  max: number,
  message: string,
) {
  if (value < min || value > max) {
    throw new Error(message);
  }
}

function parseRequiredNumber(value: string, label: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${label} 需要填写有效数字。`);
  }
  return numberValue;
}
