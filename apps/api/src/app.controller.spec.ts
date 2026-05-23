import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  let appService: {
    reviewTrainingResult: jest.Mock;
  };

  beforeEach(() => {
    appService = {
      reviewTrainingResult: jest.fn(),
    };
    appController = new AppController(appService as unknown as AppService);
  });

  describe('health', () => {
    it('should return API health status', () => {
      expect(appController.health()).toEqual({
        status: 'ok',
        service: 'rehab-platform-api',
      });
    });
  });

  describe('training result review', () => {
    it('delegates training result review requests to the service', () => {
      appService.reviewTrainingResult.mockReturnValue({ id: 'result-id' });
      const user = { id: 'doctor-user-id' };
      const body = {
        reviewConclusion: 'needs_retrain',
        reviewNote: '姿态置信度不足，请重新训练。',
      };

      expect(
        appController.reviewTrainingResult(
          user as never,
          'result-id',
          body,
        ),
      ).toEqual({ id: 'result-id' });
      expect(appService.reviewTrainingResult).toHaveBeenCalledWith(
        user,
        'result-id',
        body,
      );
    });
  });
});
