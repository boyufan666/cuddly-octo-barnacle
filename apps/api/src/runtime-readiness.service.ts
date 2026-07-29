import {
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  expectedPrismaMigrationChecksums,
  expectedPrismaMigrations,
} from './expected-prisma-migrations';
import { MIMO_USAGE_GATE, MimoUsageGate } from './mimo-usage-gate';
import { PrismaService } from './prisma.service';
import { emitProductionRuntimeEvent } from './production-runtime-event';

type AppliedMigration = {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

@Injectable()
export class RuntimeReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(MIMO_USAGE_GATE)
    private readonly mimoUsageGate: MimoUsageGate | undefined,
  ) {}

  async assertReady() {
    let dependency: 'database' | 'migration' | 'key_value' = 'database';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dependency = 'migration';
      const applied = await this.prisma.$queryRaw<AppliedMigration[]>`
        SELECT migration_name, checksum, finished_at, rolled_back_at
        FROM _prisma_migrations
      `;
      this.assertExpectedMigrations(applied);
      if (process.env.NODE_ENV === 'production') {
        dependency = 'key_value';
        if (!this.mimoUsageGate) {
          throw new ServiceUnavailableException(
            '共享 AI 配额服务未初始化，已阻断接流。',
          );
        }
        await this.mimoUsageGate.assertReady();
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        emitProductionRuntimeEvent({
          eventCode: 'runtime.ready.failed',
          dependency,
          reasonCode: 'blocked',
        });
        throw error;
      }
      emitProductionRuntimeEvent({
        eventCode: 'runtime.ready.failed',
        dependency,
        reasonCode: 'unavailable',
      });
      throw new ServiceUnavailableException('服务依赖暂不可用，尚未准备接流。');
    }

    return {
      status: 'ready',
      service: 'rehab-platform-api',
      migrationCount: expectedPrismaMigrations.length,
    };
  }

  private assertExpectedMigrations(applied: AppliedMigration[]) {
    const completed = new Set(
      applied
        .filter(
          (migration) => migration.finished_at && !migration.rolled_back_at,
        )
        .map((migration) => migration.migration_name),
    );
    const missing = expectedPrismaMigrations.filter(
      (migration) => !completed.has(migration),
    );
    if (missing.length > 0) {
      throw new ServiceUnavailableException(
        '数据库迁移状态不完整，尚未准备接流。',
      );
    }
    const checksumMismatch = applied.some(
      (migration) =>
        migration.finished_at &&
        !migration.rolled_back_at &&
        expectedPrismaMigrationChecksums[migration.migration_name] !==
          undefined &&
        expectedPrismaMigrationChecksums[migration.migration_name] !==
          migration.checksum,
    );
    if (checksumMismatch) {
      throw new ServiceUnavailableException(
        '数据库迁移校验和不匹配，尚未准备接流。',
      );
    }
  }
}
