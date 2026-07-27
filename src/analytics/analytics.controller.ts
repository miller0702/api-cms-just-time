import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import { TrackPageViewDto } from './dto/track-pageview.dto';
import { TrackEventDto } from './dto/track-event.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Extraer IP del request
   */
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

  /**
   * Track page view - público
   */
  @Post('pageview')
  async trackPageView(@Body() dto: TrackPageViewDto, @Req() req: Request) {
    const ip = this.getClientIp(req);
    const userAgent = req.headers['user-agent'] || null;
    await this.analyticsService.trackPageView(dto, ip, userAgent);
    return { success: true };
  }

  /**
   * Track event - público
   */
  @Post('event')
  async trackEvent(@Body() dto: TrackEventDto, @Req() req: Request) {
    const ip = this.getClientIp(req);
    await this.analyticsService.trackEvent(dto, ip);
    return { success: true };
  }

  /**
   * Obtener estadísticas - requiere auth
   */
  @Get('admin/stats')
  @UseGuards(JwtAuthGuard)
  async getStats(@Query('days') days?: string) {
    const numDays = days ? parseInt(days, 10) : 30;
    return this.analyticsService.getStats(numDays);
  }

  /**
   * Obtener sesiones recientes - requiere auth
   */
  @Get('admin/sessions')
  @UseGuards(JwtAuthGuard)
  async getSessions(@Query('limit') limit?: string) {
    const numLimit = limit ? parseInt(limit, 10) : 50;
    return this.analyticsService.getRecentSessions(numLimit);
  }

  /**
   * Obtener eventos agrupados - requiere auth
   */
  @Get('admin/events')
  @UseGuards(JwtAuthGuard)
  async getEvents(@Query('days') days?: string) {
    const numDays = days ? parseInt(days, 10) : 30;
    return this.analyticsService.getEventsByCategory(numDays);
  }
}
