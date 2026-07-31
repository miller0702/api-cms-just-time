import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import { TrackPageViewDto } from './dto/track-pageview.dto';
import { TrackEventDto } from './dto/track-event.dto';
import {
  TrackingIntegrationsService,
  type IntegrationPlatform,
} from './tracking-integrations.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly integrations: TrackingIntegrationsService,
  ) {}

  private getClientIp(req: Request): string | null {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      return ips.split(',')[0].trim();
    }
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }
    return req.socket?.remoteAddress || null;
  }

  @Post('pageview')
  async trackPageView(@Body() dto: TrackPageViewDto, @Req() req: Request) {
    const ip = this.getClientIp(req);
    const userAgent = req.headers['user-agent'] || null;
    await this.analyticsService.trackPageView(dto, ip, userAgent);
    return { success: true };
  }

  @Post('event')
  async trackEvent(@Body() dto: TrackEventDto, @Req() req: Request) {
    const ip = this.getClientIp(req);
    await this.analyticsService.trackEvent(dto, ip);
    return { success: true };
  }

  @Get('admin/stats')
  @UseGuards(JwtAuthGuard)
  async getStats(@Query('days') days?: string) {
    const numDays = days ? parseInt(days, 10) : 30;
    return this.analyticsService.getStats(numDays);
  }

  @Get('admin/sessions')
  @UseGuards(JwtAuthGuard)
  async getSessions(@Query('limit') limit?: string) {
    const numLimit = limit ? parseInt(limit, 10) : 50;
    return this.analyticsService.getRecentSessions(numLimit);
  }

  @Get('admin/events')
  @UseGuards(JwtAuthGuard)
  async getEvents(@Query('days') days?: string) {
    const numDays = days ? parseInt(days, 10) : 30;
    return this.analyticsService.getEventsByCategory(numDays);
  }

  @Get('admin/integrations')
  @UseGuards(JwtAuthGuard)
  listIntegrations() {
    return this.integrations.listStatuses();
  }

  @Get('admin/integrations/:platform')
  @UseGuards(JwtAuthGuard)
  getIntegration(
    @Param('platform') platform: string,
    @Query('days') days?: string,
  ) {
    const allowed: IntegrationPlatform[] = [
      'googleAnalytics',
      'meta',
      'tiktok',
      'clarity',
    ];
    if (!allowed.includes(platform as IntegrationPlatform)) {
      return { status: null, insights: null, error: 'Plataforma desconocida' };
    }
    const numDays = days ? parseInt(days, 10) : 28;
    return this.integrations.getDetail(
      platform as IntegrationPlatform,
      Number.isFinite(numDays) ? numDays : 28,
    );
  }
}
