import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrackPageViewDto } from './dto/track-pageview.dto';
import { TrackEventDto } from './dto/track-event.dto';
import * as UAParser from 'ua-parser-js';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra una vista de página
   */
  async trackPageView(dto: TrackPageViewDto, ip: string | null, userAgent: string | null) {
    const parsed = userAgent ? new UAParser.UAParser(userAgent).getResult() : null;
    
    const device = parsed?.device?.type || 'desktop';
    const browser = parsed?.browser?.name || null;
    const os = parsed?.os?.name || null;

    // Registrar la vista
    const pageView = await this.prisma.pageView.create({
      data: {
        path: dto.path,
        referrer: dto.referrer,
        userAgent,
        ip,
        device,
        browser,
        os,
        sessionId: dto.sessionId,
        visitorId: dto.visitorId,
      },
    });

    // Actualizar o crear sesión
    if (dto.sessionId) {
      await this.updateSession(dto.sessionId, dto.visitorId, ip, userAgent, dto.path, dto.referrer);
    }

    this.logger.debug(`PageView tracked: ${dto.path} from ${ip}`);
    return pageView;
  }

  /**
   * Registra un evento de analytics
   */
  async trackEvent(dto: TrackEventDto, ip: string | null) {
    const event = await this.prisma.analyticsEvent.create({
      data: {
        name: dto.name,
        category: dto.category,
        label: dto.label,
        value: dto.value,
        path: dto.path,
        ip,
        sessionId: dto.sessionId,
        visitorId: dto.visitorId,
        metadata: dto.metadata as object | undefined,
      },
    });

    this.logger.debug(`Event tracked: ${dto.name} (${dto.category}) from ${ip}`);
    return event;
  }

  /**
   * Actualizar sesión de visitante
   */
  private async updateSession(
    sessionId: string,
    visitorId: string | undefined,
    ip: string | null,
    userAgent: string | null,
    path: string,
    referrer?: string,
  ) {
    const existing = await this.prisma.visitorSession.findUnique({
      where: { id: sessionId },
    });

    if (existing) {
      await this.prisma.visitorSession.update({
        where: { id: sessionId },
        data: {
          pageViews: { increment: 1 },
          lastSeenAt: new Date(),
        },
      });
    } else {
      const parsed = userAgent ? new UAParser.UAParser(userAgent).getResult() : null;
      await this.prisma.visitorSession.create({
        data: {
          id: sessionId,
          visitorId: visitorId || sessionId,
          ip,
          userAgent,
          device: parsed?.device?.type || 'desktop',
          browser: parsed?.browser?.name,
          os: parsed?.os?.name,
          landingPage: path,
          referrer,
        },
      });
    }
  }

  /**
   * Obtener estadísticas generales
   */
  async getStats(days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [
      totalPageViews,
      uniqueVisitors,
      uniqueSessions,
      topPages,
      topReferrers,
      deviceStats,
      browserStats,
      recentEvents,
      dailyViews,
      topIPs,
    ] = await Promise.all([
      // Total page views
      this.prisma.pageView.count({
        where: { createdAt: { gte: since } },
      }),
      // Unique visitors
      this.prisma.pageView.groupBy({
        by: ['visitorId'],
        where: { createdAt: { gte: since }, visitorId: { not: null } },
      }).then((r: unknown[]) => r.length),
      // Unique sessions
      this.prisma.visitorSession.count({
        where: { startedAt: { gte: since } },
      }),
      // Top pages
      this.prisma.pageView.groupBy({
        by: ['path'],
        where: { createdAt: { gte: since } },
        _count: { path: true },
        orderBy: { _count: { path: 'desc' } },
        take: 10,
      }),
      // Top referrers
      this.prisma.pageView.groupBy({
        by: ['referrer'],
        where: { createdAt: { gte: since }, referrer: { not: null } },
        _count: { referrer: true },
        orderBy: { _count: { referrer: 'desc' } },
        take: 10,
      }),
      // Device stats
      this.prisma.pageView.groupBy({
        by: ['device'],
        where: { createdAt: { gte: since } },
        _count: { device: true },
      }),
      // Browser stats
      this.prisma.pageView.groupBy({
        by: ['browser'],
        where: { createdAt: { gte: since }, browser: { not: null } },
        _count: { browser: true },
        orderBy: { _count: { browser: 'desc' } },
        take: 5,
      }),
      // Recent events
      this.prisma.analyticsEvent.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      // Daily views
      this.getDailyViews(days),
      // Top IPs
      this.prisma.pageView.groupBy({
        by: ['ip'],
        where: { createdAt: { gte: since }, ip: { not: null } },
        _count: { ip: true },
        orderBy: { _count: { ip: 'desc' } },
        take: 20,
      }),
    ]);

    return {
      period: { days, since: since.toISOString() },
      overview: {
        totalPageViews,
        uniqueVisitors,
        uniqueSessions,
        avgPagesPerSession: uniqueSessions > 0 ? Math.round(totalPageViews / uniqueSessions * 10) / 10 : 0,
      },
      topPages: topPages.map((p: { path: string; _count: { path: number } }) => ({ path: p.path, views: p._count.path })),
      topReferrers: topReferrers.map((r: { referrer: string | null; _count: { referrer: number } }) => ({ referrer: r.referrer, count: r._count.referrer })),
      devices: deviceStats.map((d: { device: string | null; _count: { device: number } }) => ({ device: d.device || 'unknown', count: d._count.device })),
      browsers: browserStats.map((b: { browser: string | null; _count: { browser: number } }) => ({ browser: b.browser, count: b._count.browser })),
      topIPs: topIPs.map((i: { ip: string | null; _count: { ip: number } }) => ({ ip: i.ip, views: i._count.ip })),
      dailyViews,
      recentEvents: recentEvents.map((e: { id: string; name: string; category: string | null; label: string | null; path: string | null; createdAt: Date }) => ({
        id: e.id,
        name: e.name,
        category: e.category,
        label: e.label,
        path: e.path,
        createdAt: e.createdAt,
      })),
    };
  }

  /**
   * Obtener vistas diarias
   */
  private async getDailyViews(days: number) {
    const result: Array<{ date: string; views: number }> = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const count = await this.prisma.pageView.count({
        where: {
          createdAt: {
            gte: date,
            lt: nextDate,
          },
        },
      });

      result.push({
        date: date.toISOString().split('T')[0],
        views: count,
      });
    }

    return result;
  }

  /**
   * Obtener sesiones recientes
   */
  async getRecentSessions(limit: number = 50) {
    return this.prisma.visitorSession.findMany({
      orderBy: { lastSeenAt: 'desc' },
      take: limit,
      select: {
        id: true,
        visitorId: true,
        ip: true,
        country: true,
        city: true,
        device: true,
        browser: true,
        os: true,
        landingPage: true,
        referrer: true,
        pageViews: true,
        startedAt: true,
        lastSeenAt: true,
      },
    });
  }

  /**
   * Obtener eventos por categoría
   */
  async getEventsByCategory(days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.prisma.analyticsEvent.groupBy({
      by: ['category', 'name'],
      where: { createdAt: { gte: since } },
      _count: { name: true },
      orderBy: { _count: { name: 'desc' } },
    });
  }
}
