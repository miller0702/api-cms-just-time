import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ErpUrbanismoClient } from '../projects/erp-urbanismo.client';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';

@Module({
  imports: [AuthModule, NotificationsModule],
  providers: [LeadsService, ErpUrbanismoClient],
  controllers: [LeadsController],
})
export class LeadsModule {}
