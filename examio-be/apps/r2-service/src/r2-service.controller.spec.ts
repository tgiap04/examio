import { Test, TestingModule } from '@nestjs/testing';
import { R2ServiceController } from './r2-service.controller';
import { R2ServiceService } from './r2-service.service';

describe('R2ServiceController', () => {
    let controller: R2ServiceController;

    const mockR2ServiceService = {
        uploadFile: jest.fn(),
        getPublicUrl: jest.fn(),
        deleteFile: jest.fn(),
    };

    beforeEach(async () => {
        const app: TestingModule = await Test.createTestingModule({
            controllers: [R2ServiceController],
            providers: [
                {
                    provide: R2ServiceService,
                    useValue: mockR2ServiceService,
                },
            ],
        }).compile();

        controller = app.get<R2ServiceController>(R2ServiceController);
    });

    it('is defined', () => {
        expect(controller).toBeDefined();
    });
});
