import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { TrackingIntegrationsService } from './tracking-integrations.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, TrackingIntegrationsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
