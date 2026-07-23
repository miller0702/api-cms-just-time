import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PillsService } from './pills.service';
import { PillsController } from './pills.controller';

@Module({
  imports: [AuthModule],
  providers: [PillsService],
  controllers: [PillsController],
})
export class PillsModule {}
