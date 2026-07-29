import { AppService } from './app.service';
import type { RequestUser } from './current-user';
import { PrismaService } from './prisma.service';

const testSensitiveEncryptionKey = {
  kid: 'secret-manager://rehab/unit-sensitive-key',
  key: Buffer.alloc(32, 11),
};

describe('patient access query boundaries', () => {
  it('selects only the non-sensitive fields required for doctor access', async () => {
    const patientFindUnique = jest.fn().mockResolvedValue({
      id: 'patient-profile-id',
      responsibleDoctorId: 'doctor-profile-id',
    });
    const collectionBatchFindMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      patientProfile: { findUnique: patientFindUnique },
      collectionBatch: { findMany: collectionBatchFindMany },
    };
    const service = new AppService(
      prisma as unknown as PrismaService,
      testSensitiveEncryptionKey,
    );
    const doctorUser: RequestUser = {
      id: 'doctor-user-id',
      account: 'doctor',
      displayName: '医生',
      roles: [
        {
          roleCode: 'doctor',
          relatedObjectType: 'doctor',
          relatedObjectId: 'doctor-profile-id',
        },
      ],
    };

    await expect(
      service.listPatientCollectionBatches(doctorUser, 'patient-profile-id'),
    ).resolves.toEqual([]);

    expect(patientFindUnique).toHaveBeenCalledWith({
      where: { id: 'patient-profile-id' },
      select: { id: true, responsibleDoctorId: true },
    });
  });
});
