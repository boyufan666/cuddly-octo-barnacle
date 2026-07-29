export type UserIdentityPayload = {
  displayName: string;
  mobilePhone: string | null;
};

export class InvalidUserIdentityPayloadError extends Error {
  constructor() {
    super('User identity envelope payload is invalid.');
    this.name = 'InvalidUserIdentityPayloadError';
  }
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseUserIdentityPayload(value: unknown): UserIdentityPayload {
  if (!isUnknownRecord(value)) {
    throw new InvalidUserIdentityPayloadError();
  }

  const displayName = value.displayName;
  const mobilePhone = value.mobilePhone;
  if (
    typeof displayName !== 'string' ||
    displayName.trim().length === 0 ||
    !(mobilePhone === null || typeof mobilePhone === 'string')
  ) {
    throw new InvalidUserIdentityPayloadError();
  }

  return {
    displayName: displayName.trim(),
    mobilePhone,
  };
}
