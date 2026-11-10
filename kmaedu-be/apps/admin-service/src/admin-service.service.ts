import { Injectable } from '@nestjs/common';

@Injectable()
export class AdminServiceService {
    getHello(): string {
        return 'Admin Service';
    }
}
