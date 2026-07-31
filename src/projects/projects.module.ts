import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ErpUrbanismoClient } from './erp-urbanismo.client';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';

@Module({
  imports: [AuthModule, NotificationsModule],
  providers: [ProjectsService, ErpUrbanismoClient],
  controllers: [ProjectsController],
})
export class ProjectsModule {}
