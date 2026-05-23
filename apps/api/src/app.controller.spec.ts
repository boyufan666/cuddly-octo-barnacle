import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(() => {
    appController = new AppController({} as AppService);
  });

  describe('health', () => {
    it('should return API health status', () => {
      expect(appController.health()).toEqual({
        status: 'ok',
        service: 'rehab-platform-api',
      });
    });
  });
});
