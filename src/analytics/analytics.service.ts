import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TrackPageViewDto } from './dto/track-pageview.dto';
import { TrackEventDto } from './dto/track-event.dto';
import * as UAParser from 'ua-parser-js';
import {
  COLOMBIA_REGIONS,
  countryCentroid,
  countryName,
  lookupIp,
} from './geoip';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly statsCache = new Map<number, { at: number; data: unknown }>();
  private readonly STATS_CACHE_MS = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra una vista de página
   */
  async trackPageView(
    dto: TrackPageViewDto,
    ip: string | null,
    userAgent: string | null,
  ) {
    const parsed = userAgent
      ? new UAParser.UAParser(userAgent).getResult()
      : null;

    const device = parsed?.device?.type || 'desktop';
    const browser = parsed?.browser?.name || null;
    const os = parsed?.os?.name || null;
    const geo = lookupIp(ip);

    // Registrar la vista
    const pageView = await this.prisma.pageView.create({
      data: {
        path: dto.path,
        referrer: dto.referrer,
        userAgent,
        ip,
        country: geo?.country ?? null,
        city: geo?.city ?? null,
        device,
        browser,
        os,
        sessionId: dto.sessionId,
        visitorId: dto.visitorId,
      },
    });

    // Actualizar o crear sesión
    if (dto.sessionId) {
      await this.updateSession(
        dto.sessionId,
        dto.visitorId,
        ip,
        userAgent,
        dto.path,
        dto.referrer,
        geo?.country ?? null,
        geo?.city ?? null,
      );
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
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    this.logger.debug(
      `Event tracked: ${dto.name} (${dto.category}) from ${ip}`,
    );
    return event;
  }

  /**
   * Actualizar sesión de visitante - agrupa por IP dentro de una ventana de tiempo
   */
  private async updateSession(
    sessionId: string,
    visitorId: string | undefined,
    ip: string | null,
    userAgent: string | null,
    path: string,
    referrer?: string,
    country?: string | null,
    city?: string | null,
  ) {
    const parsed = userAgent
      ? new UAParser.UAParser(userAgent).getResult()
      : null;
    const device = parsed?.device?.type || 'desktop';
    const browser = parsed?.browser?.name || null;

    // Ventana de tiempo para considerar la misma sesión (30 minutos)
    const sessionWindow = new Date();
    sessionWindow.setMinutes(sessionWindow.getMinutes() - 30);

    // Buscar sesión existente por IP + dispositivo + navegador (más reciente)
    const existingByIp = ip
      ? await this.prisma.visitorSession.findFirst({
          where: {
            ip,
            device,
            browser,
            lastSeenAt: { gte: sessionWindow },
          },
          orderBy: { lastSeenAt: 'desc' },
        })
      : null;

    if (existingByIp) {
      // Actualizar sesión existente
      await this.prisma.visitorSession.update({
        where: { id: existingByIp.id },
        data: {
          pageViews: { increment: 1 },
          lastSeenAt: new Date(),
          ...(country && !existingByIp.country ? { country, city } : {}),
        },
      });
    } else {
      // Crear nueva sesión
      await this.prisma.visitorSession.create({
        data: {
          id: sessionId,
          visitorId: visitorId || sessionId,
          ip,
          userAgent,
          country: country ?? null,
          city: city ?? null,
          device,
          browser,
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
    const safeDays = Math.min(Math.max(days || 30, 1), 90);
    const cached = this.statsCache.get(safeDays);
    if (cached && Date.now() - cached.at < this.STATS_CACHE_MS) {
      return cached.data;
    }

    const since = new Date();
    since.setDate(since.getDate() - safeDays);

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
      heatmap,
      topIPs,
      geo,
    ] = await Promise.all([
      this.prisma.pageView.count({
        where: { createdAt: { gte: since } },
      }),
      this.countDistinctVisitors(since),
      this.prisma.visitorSession.count({
        where: { startedAt: { gte: since } },
      }),
      this.prisma.pageView.groupBy({
        by: ['path'],
        where: { createdAt: { gte: since } },
        _count: { path: true },
        orderBy: { _count: { path: 'desc' } },
        take: 10,
      }),
      this.prisma.pageView.groupBy({
        by: ['referrer'],
        where: { createdAt: { gte: since }, referrer: { not: null } },
        _count: { referrer: true },
        orderBy: { _count: { referrer: 'desc' } },
        take: 10,
      }),
      this.prisma.pageView.groupBy({
        by: ['device'],
        where: { createdAt: { gte: since } },
        _count: { device: true },
      }),
      this.prisma.pageView.groupBy({
        by: ['browser'],
        where: { createdAt: { gte: since }, browser: { not: null } },
        _count: { browser: true },
        orderBy: { _count: { browser: 'desc' } },
        take: 5,
      }),
      this.prisma.analyticsEvent.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          name: true,
          category: true,
          label: true,
          path: true,
          createdAt: true,
        },
      }),
      this.getDailyViews(safeDays, since),
      this.getHeatmap(since),
      this.prisma.pageView.groupBy({
        by: ['ip'],
        where: { createdAt: { gte: since }, ip: { not: null } },
        _count: { ip: true },
        orderBy: { _count: { ip: 'desc' } },
        take: 20,
      }),
      this.getGeo(since),
    ]);

    const data = {
      period: { days: safeDays, since: since.toISOString() },
      overview: {
        totalPageViews,
        uniqueVisitors,
        uniqueSessions,
        avgPagesPerSession:
          uniqueSessions > 0
            ? Math.round((totalPageViews / uniqueSessions) * 10) / 10
            : 0,
      },
      topPages: topPages.map(
        (p: { path: string; _count: { path: number } }) => ({
          path: p.path,
          views: p._count.path,
        }),
      ),
      topReferrers: topReferrers.map(
        (r: { referrer: string | null; _count: { referrer: number } }) => ({
          referrer: r.referrer,
          count: r._count.referrer,
        }),
      ),
      devices: deviceStats.map(
        (d: { device: string | null; _count: { device: number } }) => ({
          device: d.device || 'unknown',
          count: d._count.device,
        }),
      ),
      browsers: browserStats.map(
        (b: { browser: string | null; _count: { browser: number } }) => ({
          browser: b.browser,
          count: b._count.browser,
        }),
      ),
      topIPs: topIPs.map(
        (i: { ip: string | null; _count: { ip: number } }) => ({
          ip: i.ip,
          views: i._count.ip,
        }),
      ),
      dailyViews,
      heatmap,
      geo,
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        name: e.name,
        category: e.category,
        label: e.label,
        path: e.path,
        createdAt: e.createdAt,
      })),
    };

    this.statsCache.set(safeDays, { at: Date.now(), data });
    return data;
  }

  private async countDistinctVisitors(since: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(DISTINCT visitor_id) AS count
      FROM cms.page_views
      WHERE created_at >= ${since}
        AND visitor_id IS NOT NULL
    `;
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * Una sola query agrupada por día (antes: N counts secuenciales).
   */
  private async getDailyViews(days: number, since: Date) {
    const rows = await this.prisma.$queryRaw<
      Array<{ day: Date | string; views: bigint | number }>
    >`
      SELECT (created_at AT TIME ZONE 'UTC')::date AS day,
             COUNT(*)::int AS views
      FROM cms.page_views
      WHERE created_at >= ${since}
      GROUP BY 1
      ORDER BY 1
    `;

    const byDay = new Map<string, number>();
    for (const row of rows) {
      const key =
        row.day instanceof Date
          ? row.day.toISOString().slice(0, 10)
          : String(row.day).slice(0, 10);
      byDay.set(key, Number(row.views));
    }

    const result: Array<{ date: string; views: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - i);
      const key = date.toISOString().slice(0, 10);
      result.push({ date: key, views: byDay.get(key) ?? 0 });
    }
    return result;
  }

  /**
   * Agrega vistas por país y por departamento (Colombia) resolviendo IP → geo.
   * Usa country guardado cuando existe; si no, GeoLite (cubre histórico sin country).
   */
  private async getGeo(since: Date) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        ip: string | null;
        country: string | null;
        views: number | bigint;
      }>
    >`
      SELECT ip, country, COUNT(*)::int AS views
      FROM cms.page_views
      WHERE created_at >= ${since}
        AND ip IS NOT NULL
      GROUP BY ip, country
    `;

    const countries = new Map<string, number>();
    const colombia = new Map<string, number>();
    const colombiaCities = new Map<
      string,
      { region: string; city: string; views: number; lat: number; lon: number }
    >();
    let unresolved = 0;

    for (const row of rows) {
      const views = Number(row.views);
      const geo = lookupIp(row.ip);
      const code = (row.country || geo?.country || '').toUpperCase();
      if (!code) {
        unresolved += views;
        continue;
      }
      countries.set(code, (countries.get(code) || 0) + views);
      if (code === 'CO') {
        const region = geo?.region || '_';
        colombia.set(region, (colombia.get(region) || 0) + views);
        const city = (geo?.city || '').trim();
        if (city) {
          const key = `${region}|${city.toLowerCase()}`;
          const prev = colombiaCities.get(key);
          if (prev) {
            prev.views += views;
          } else {
            colombiaCities.set(key, {
              region,
              city,
              views,
              lat: geo?.lat ?? COLOMBIA_REGIONS[region]?.lat ?? 4.57,
              lon: geo?.lon ?? COLOMBIA_REGIONS[region]?.lon ?? -74.3,
            });
          }
        }
      }
    }

    const countryList = [...countries.entries()]
      .map(([code, views]) => {
        const c = countryCentroid(code);
        return {
          code,
          name: countryName(code),
          views,
          lat: c.lat,
          lon: c.lon,
        };
      })
      .sort((a, b) => b.views - a.views);

    const colombiaList = [...colombia.entries()]
      .map(([code, views]) => {
        const meta = COLOMBIA_REGIONS[code];
        return {
          code,
          name: meta?.name || (code === '_' ? 'Sin departamento' : code),
          views,
          lat: meta?.lat ?? 4.57,
          lon: meta?.lon ?? -74.3,
        };
      })
      .sort((a, b) => b.views - a.views);

    const cityList = [...colombiaCities.values()].sort(
      (a, b) => b.views - a.views,
    );

    return {
      countries: countryList,
      colombia: colombiaList,
      colombiaCities: cityList,
      unresolvedViews: unresolved,
      maxCountryViews: countryList[0]?.views ?? 0,
      maxColombiaViews: colombiaList[0]?.views ?? 0,
    };
  }

  /**
   * Mapa de calor: día de la semana × hora (zona America/Bogota).
   * dow: 0=domingo … 6=sábado (EXTRACT DOW de Postgres).
   */
  private async getHeatmap(since: Date) {
    const timezone = 'America/Bogota';
    const rows = await this.prisma.$queryRaw<
      Array<{ dow: number | bigint; hour: number | bigint; views: number | bigint }>
    >`
      SELECT EXTRACT(DOW FROM created_at AT TIME ZONE 'America/Bogota')::int AS dow,
             EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Bogota')::int AS hour,
             COUNT(*)::int AS views
      FROM cms.page_views
      WHERE created_at >= ${since}
      GROUP BY 1, 2
    `;

    const cells = rows.map((r) => ({
      dow: Number(r.dow),
      hour: Number(r.hour),
      views: Number(r.views),
    }));
    const max = cells.reduce((m, c) => Math.max(m, c.views), 0);

    return { timezone, max, cells };
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
