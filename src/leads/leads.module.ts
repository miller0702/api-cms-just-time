import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';

@Module({
  imports: [AuthModule, NotificationsModule],
  providers: [LeadsService],
  controllers: [LeadsController],
})
export class LeadsModule {}
