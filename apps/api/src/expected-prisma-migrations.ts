import migrationManifest from '../../../packages/db/prisma/migration-manifest.json';

type PrismaMigrationManifestEntry = {
  name: string;
  sha256: string;
};

const migrations =
  migrationManifest.migrations as PrismaMigrationManifestEntry[];

export const expectedPrismaMigrations = Object.freeze(
  migrations.map((migration) => migration.name),
);

export const expectedPrismaMigrationChecksums = Object.freeze(
  Object.fromEntries(
    migrations.map((migration) => [migration.name, migration.sha256]),
  ) as Record<string, string>,
);
