import { Test } from '@nestjs/testing';
import { AppModule, loadPublicCredentialThrottleConfig } from './app.module';

const LIMIT_ENV_NAME = 'PUBLIC_CREDENTIAL_THROTTLE_LIMIT';
const TTL_ENV_NAME = 'PUBLIC_CREDENTIAL_THROTTLE_TTL_MS';
const ENV_NAMES = [LIMIT_ENV_NAME, TTL_ENV_NAME] as const;
const SENSITIVE_KEY_REF_ENV_NAME = 'SENSITIVE_DATA_KEY_REF';
const SENSITIVE_KEY_ENV_NAME = 'SENSITIVE_DATA_KEY';
const MODULE_ENV_NAMES = [
  ...ENV_NAMES,
  SENSITIVE_KEY_REF_ENV_NAME,
  SENSITIVE_KEY_ENV_NAME,
] as const;

describe('public credential throttle configuration', () => {
  const originalEnv = new Map<string, string | undefined>();

  beforeAll(() => {
    for (const name of MODULE_ENV_NAMES) {
      originalEnv.set(name, process.env[name]);
    }
  });

  beforeEach(() => {
    process.env[LIMIT_ENV_NAME] = '2';
    process.env[TTL_ENV_NAME] = '60000';
    process.env[SENSITIVE_KEY_REF_ENV_NAME] =
      'secret-manager://rehab/unit-sensitive-key';
    process.env[SENSITIVE_KEY_ENV_NAME] = Buffer.alloc(32, 11).toString(
      'base64',
    );
  });

  afterAll(() => {
    for (const [name, value] of originalEnv) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  function loadConfig(env: NodeJS.ProcessEnv) {
    return loadPublicCredentialThrottleConfig(env);
  }

  it.each(ENV_NAMES)('hard-fails when %s is missing', (name) => {
    const env = { ...process.env };
    delete env[name];

    expect(() => loadConfig(env)).toThrow(
      new RegExp(`${name}.*positive safe integer`, 'i'),
    );
  });

  it.each([
    ['', 'empty'],
    ['0', 'zero'],
    ['-1', 'negative'],
    ['1.5', 'fractional'],
    ['1e3', 'non-decimal'],
    ['9007199254740992', 'unsafe'],
    ['not-a-number', 'non-numeric'],
  ])('hard-fails for an %s limit value (%s)', (value) => {
    const env = { ...process.env, [LIMIT_ENV_NAME]: value };

    expect(() => loadConfig(env)).toThrow(
      new RegExp(`${LIMIT_ENV_NAME}.*positive safe integer`, 'i'),
    );
  });

  it.each([
    ['', 'empty'],
    ['0', 'zero'],
    ['-1', 'negative'],
    ['1.5', 'fractional'],
    ['1e3', 'non-decimal'],
    ['9007199254740992', 'unsafe'],
    ['not-a-number', 'non-numeric'],
  ])('hard-fails for an %s TTL value (%s)', (value) => {
    const env = { ...process.env, [TTL_ENV_NAME]: value };

    expect(() => loadConfig(env)).toThrow(
      new RegExp(`${TTL_ENV_NAME}.*positive safe integer`, 'i'),
    );
  });

  it('loads the two explicit decimal positive safe integers without defaults', () => {
    process.env[LIMIT_ENV_NAME] = '7';
    process.env[TTL_ENV_NAME] = '45000';

    expect(loadConfig(process.env)).toEqual({ limit: 7, ttl: 45000 });
  });

  it('wires hard-fail validation into Nest module initialization', async () => {
    delete process.env[LIMIT_ENV_NAME];

    await expect(
      Test.createTestingModule({ imports: [AppModule] }).compile(),
    ).rejects.toThrow(
      new RegExp(`${LIMIT_ENV_NAME}.*positive safe integer`, 'i'),
    );
  });
});
