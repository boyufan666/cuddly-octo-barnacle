const requiredAccounts = Object.freeze([
  "admin",
  "doctor001",
  "patient001",
  "caregiver001",
]);

export function resolvePlaywrightRegressionEnvironment(env = process.env) {
  const databaseUrl = requireDedicatedDatabaseUrl(env);
  requireExact(env, "PLAYWRIGHT_CONFIRM_DISPOSABLE", "YES");
  const webPort = requirePort(env, "PLAYWRIGHT_WEB_PORT");
  const apiPort = requirePort(env, "PLAYWRIGHT_API_PORT");
  if (webPort === apiPort) {
    throw new Error("PLAYWRIGHT_WEB_PORT and PLAYWRIGHT_API_PORT must differ.");
  }

  const seedPassword = requireCredentialPassword(
    env,
    "PLAYWRIGHT_SEED_PASSWORD",
  );
  const accountPassword = requireCredentialPassword(
    env,
    "PLAYWRIGHT_ACCOUNT_PASSWORD",
  );
  if (seedPassword === accountPassword) {
    throw new Error(
      "PLAYWRIGHT_SEED_PASSWORD and PLAYWRIGHT_ACCOUNT_PASSWORD must differ.",
    );
  }

  return Object.freeze({
    databaseUrl,
    webPort,
    apiPort,
    jwtSecret: requireMinimumUtf8Bytes(env, "PLAYWRIGHT_JWT_SECRET", 32),
    cookieSecure: requireBoolean(env, "PLAYWRIGHT_COOKIE_SECURE"),
    throttleLimit: requirePositiveSafeInteger(
      env,
      "PLAYWRIGHT_PUBLIC_CREDENTIAL_THROTTLE_LIMIT",
    ),
    throttleTtlMs: requirePositiveSafeInteger(
      env,
      "PLAYWRIGHT_PUBLIC_CREDENTIAL_THROTTLE_TTL_MS",
    ),
    sensitiveDataKeyRef: requireExactNonEmpty(
      env,
      "PLAYWRIGHT_SENSITIVE_DATA_KEY_REF",
    ),
    sensitiveDataKey: requireCanonicalBase64Key(
      env,
      "PLAYWRIGHT_SENSITIVE_DATA_KEY",
      32,
    ),
    seedPassword,
    accountPassword,
    requiredAccounts,
  });
}

function requireDedicatedDatabaseUrl(env) {
  const value = requireEnvironment(env, "PLAYWRIGHT_DATABASE_URL");
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("PLAYWRIGHT_DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("PLAYWRIGHT_DATABASE_URL must be a PostgreSQL URL.");
  }
  if (decodeURIComponent(parsed.pathname) !== "/rehab_playwright_test") {
    throw new Error(
      "PLAYWRIGHT_DATABASE_URL database name must be rehab_playwright_test.",
    );
  }
  if (parsed.searchParams.has("schema")) {
    throw new Error("PLAYWRIGHT_DATABASE_URL must not select a schema.");
  }
  return value;
}

function requireEnvironment(env, name) {
  const value = env[name];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${name} is required and must not be blank.`);
  }
  return value;
}

function requireExact(env, name, expected) {
  const value = requireEnvironment(env, name);
  if (value !== expected) throw new Error(`${name}=${expected} is required.`);
  return value;
}

function requireExactNonEmpty(env, name) {
  const value = requireEnvironment(env, name);
  if (value.trim() !== value) {
    throw new Error(`${name} must be an exact non-empty value.`);
  }
  return value;
}

function requireCredentialPassword(env, name) {
  const value = requireExactNonEmpty(env, name);
  if (value.length < 8 || value.length > 128) {
    throw new Error(`${name} length must be between 8 and 128 characters.`);
  }
  return value;
}

function requirePort(env, name) {
  const value = requireEnvironment(env, name);
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be an integer from 1 through 65535.`);
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port > 65_535) {
    throw new Error(`${name} must be an integer from 1 through 65535.`);
  }
  return port;
}

function requireMinimumUtf8Bytes(env, name, minimumBytes) {
  const value = requireEnvironment(env, name);
  if (Buffer.byteLength(value, "utf8") < minimumBytes) {
    throw new Error(
      `${name} must contain at least ${minimumBytes} UTF-8 bytes.`,
    );
  }
  return value;
}

function requireBoolean(env, name) {
  const value = requireEnvironment(env, name);
  if (value !== "true" && value !== "false") {
    throw new Error(`${name} must be exactly true or false.`);
  }
  return value;
}

function requirePositiveSafeInteger(env, name) {
  const value = requireEnvironment(env, name);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  return value;
}

function requireCanonicalBase64Key(env, name, expectedBytes) {
  const value = requireEnvironment(env, name);
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.byteLength !== expectedBytes ||
    decoded.toString("base64") !== value
  ) {
    throw new Error(
      `${name} must be canonical base64 encoding exactly ${expectedBytes} bytes.`,
    );
  }
  return value;
}
