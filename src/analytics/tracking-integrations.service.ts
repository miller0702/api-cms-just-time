import { Injectable, Logger } from '@nestjs/common';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { SettingsService, type TrackingSettings } from '../settings/settings.service';

export type IntegrationPlatform = 'googleAnalytics' | 'meta' | 'tiktok' | 'clarity';

export type IntegrationStatus = {
  platform: IntegrationPlatform;
  label: string;
  configured: boolean;
  pixelReady: boolean;
  apiReady: boolean;
  publicId: string | null;
  dashboardUrl: string | null;
  hint: string;
};

type GaCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
  [key: string]: unknown;
};

@Injectable()
export class TrackingIntegrationsService {
  private readonly logger = new Logger(TrackingIntegrationsService.name);

  constructor(private readonly settings: SettingsService) {}

  async listStatuses(): Promise<IntegrationStatus[]> {
    const t = await this.settings.getTrackingRaw();
    return [
      this.statusGa(t),
      this.statusMeta(t),
      this.statusTiktok(t),
      this.statusClarity(t),
    ].filter((s) => s.configured);
  }

  async getDetail(platform: IntegrationPlatform, days = 28) {
    const t = await this.settings.getTrackingRaw();
    const statusMap = {
      googleAnalytics: this.statusGa(t),
      meta: this.statusMeta(t),
      tiktok: this.statusTiktok(t),
      clarity: this.statusClarity(t),
    };
    const status = statusMap[platform];
    if (!status?.configured) {
      return { status: null, insights: null, error: 'Plataforma no configurada' };
    }

    const rangeDays = Math.min(Math.max(days, 1), 90);
    let insights: unknown = null;
    let error: string | null = null;
    try {
      if (platform === 'clarity' && t.clarity?.apiToken) {
        insights = await this.fetchClarity(t.clarity.apiToken, t.clarity.projectId);
      } else if (platform === 'meta' && t.meta?.accessToken && t.meta?.pixelId) {
        insights = await this.fetchMeta(t.meta.pixelId, t.meta.accessToken);
      } else if (platform === 'tiktok' && t.tiktok?.accessToken && t.tiktok?.pixelId) {
        insights = await this.fetchTiktok(t.tiktok.pixelId, t.tiktok.accessToken);
      } else if (platform === 'googleAnalytics') {
        const propertyId = t.googleAnalytics?.propertyId?.trim();
        const apiToken = t.googleAnalytics?.apiToken?.trim();
        if (propertyId && apiToken) {
          insights = await this.fetchGa4(propertyId, apiToken, rangeDays);
        } else {
          insights = {
            source: 'ga4-setup',
            measurementId: t.googleAnalytics?.measurementId || null,
            propertyId: propertyId || null,
            hasServiceAccount: Boolean(apiToken),
            note: 'Falta Property ID y/o JSON de service account para leer métricas con la Data API.',
            setup: [
              '1. Google Cloud → crea proyecto → habilita “Google Analytics Data API”.',
              '2. IAM → Service account → crea una → Keys → JSON.',
              '3. En GA4 Admin → Property access management → agrega el client_email como Viewer.',
              '4. Pega Property ID + JSON completo en Ajustes → Tracking.',
            ],
          };
        }
      } else {
        insights = {
          note: 'Píxel activo en el sitio. Añade un token de API en Ajustes → Tracking para traer métricas aquí.',
        };
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al consultar la API externa';
      this.logger.warn(`Integración ${platform}: ${error}`);
    }

    return { status, insights, error };
  }

  private statusGa(t: TrackingSettings): IntegrationStatus {
    const id = t.googleAnalytics?.measurementId?.trim() || '';
    const apiReady = Boolean(
      t.googleAnalytics?.apiToken?.trim() && t.googleAnalytics?.propertyId?.trim(),
    );
    return {
      platform: 'googleAnalytics',
      label: 'Google Analytics',
      configured: Boolean(id),
      pixelReady: Boolean(id),
      apiReady,
      publicId: id || null,
      dashboardUrl: 'https://analytics.google.com/analytics/web/',
      hint: apiReady
        ? 'Measurement ID activo y Data API configurada.'
        : id
          ? 'gtag envía pageviews. Añade Property ID + service account para leer métricas aquí.'
          : 'Configura el Measurement ID (G-…).',
    };
  }

  private statusMeta(t: TrackingSettings): IntegrationStatus {
    const id = t.meta?.pixelId?.trim() || '';
    return {
      platform: 'meta',
      label: 'Meta (Facebook / Instagram)',
      configured: Boolean(id),
      pixelReady: Boolean(id),
      apiReady: Boolean(id && t.meta?.accessToken?.trim()),
      publicId: id || null,
      dashboardUrl: id
        ? `https://business.facebook.com/events_manager2/list/pixel/${id}`
        : 'https://business.facebook.com/events_manager2',
      hint: id
        ? 'Pixel Meta activo en el sitio.'
        : 'Configura el Pixel ID.',
    };
  }

  private statusTiktok(t: TrackingSettings): IntegrationStatus {
    const id = t.tiktok?.pixelId?.trim() || '';
    return {
      platform: 'tiktok',
      label: 'TikTok',
      configured: Boolean(id),
      pixelReady: Boolean(id),
      apiReady: Boolean(id && t.tiktok?.accessToken?.trim()),
      publicId: id || null,
      dashboardUrl: 'https://ads.tiktok.com/i18n/events_manager',
      hint: id ? 'Pixel TikTok activo en el sitio.' : 'Configura el Pixel ID.',
    };
  }

  private statusClarity(t: TrackingSettings): IntegrationStatus {
    const id = t.clarity?.projectId?.trim() || '';
    return {
      platform: 'clarity',
      label: 'Microsoft Clarity',
      configured: Boolean(id),
      pixelReady: Boolean(id),
      apiReady: Boolean(id && t.clarity?.apiToken?.trim()),
      publicId: id || null,
      dashboardUrl: id
        ? `https://clarity.microsoft.com/projects/view/${id}/dashboard`
        : 'https://clarity.microsoft.com/',
      hint: id
        ? 'Clarity graba sesiones en el sitio.'
        : 'Configura el Project ID.',
    };
  }

  private parseGaCredentials(raw: string): GaCredentials {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        'El token de GA debe ser el JSON completo de la service account (empieza con {).',
      );
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('JSON de service account inválido');
    }
    const creds = parsed as GaCredentials;
    if (!creds.client_email || !creds.private_key) {
      throw new Error(
        'El JSON debe incluir client_email y private_key (clave de service account de Google Cloud).',
      );
    }
    return {
      ...creds,
      private_key: String(creds.private_key).replace(/\\n/g, '\n'),
    };
  }

  private normalizePropertyId(propertyId: string): string {
    const trimmed = propertyId.trim().replace(/^properties\//, '');
    if (!/^\d+$/.test(trimmed)) {
      throw new Error('Property ID inválido: usa solo el número (ej. 123456789).');
    }
    return trimmed;
  }

  private async fetchGa4(propertyId: string, serviceAccountJson: string, days: number) {
    const property = this.normalizePropertyId(propertyId);
    const credentials = this.parseGaCredentials(serviceAccountJson);
    const client = new BetaAnalyticsDataClient({ credentials });
    const startDate = `${days}daysAgo`;
    const endDate = 'today';
    const propertyPath = `properties/${property}`;

    const [overviewRes, dailyRes, pagesRes, sourcesRes] = await Promise.all([
      client.runReport({
        property: propertyPath,
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'engagedSessions' },
        ],
      }),
      client.runReport({
        property: propertyPath,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
        ],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
      client.runReport({
        property: propertyPath,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      }),
      client.runReport({
        property: propertyPath,
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 8,
      }),
    ]);

    const overviewRow = overviewRes[0]?.rows?.[0];
    const metric = (i: number) => overviewRow?.metricValues?.[i]?.value ?? '0';

    const daily = (dailyRes[0]?.rows || []).map((row) => {
      const raw = row.dimensionValues?.[0]?.value || '';
      const date =
        raw.length === 8
          ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
          : raw;
      return {
        date,
        activeUsers: Number(row.metricValues?.[0]?.value || 0),
        sessions: Number(row.metricValues?.[1]?.value || 0),
        pageViews: Number(row.metricValues?.[2]?.value || 0),
      };
    });

    const topPages = (pagesRes[0]?.rows || []).map((row) => ({
      path: row.dimensionValues?.[0]?.value || '/',
      pageViews: Number(row.metricValues?.[0]?.value || 0),
      activeUsers: Number(row.metricValues?.[1]?.value || 0),
    }));

    const channels = (sourcesRes[0]?.rows || []).map((row) => ({
      channel: row.dimensionValues?.[0]?.value || 'Unknown',
      sessions: Number(row.metricValues?.[0]?.value || 0),
      activeUsers: Number(row.metricValues?.[1]?.value || 0),
    }));

    return {
      source: 'ga4-data-api',
      propertyId: property,
      serviceAccountEmail: credentials.client_email,
      period: { days, startDate, endDate },
      overview: {
        activeUsers: Number(metric(0)),
        sessions: Number(metric(1)),
        pageViews: Number(metric(2)),
        bounceRate: Number(metric(3)),
        averageSessionDurationSec: Number(metric(4)),
        engagedSessions: Number(metric(5)),
      },
      daily,
      topPages,
      channels,
    };
  }

  private async fetchClarity(apiToken: string, projectId?: string) {
    const url = new URL(
      'https://www.clarity.ms/export-data/api/v1/project-live-insights',
    );
    url.searchParams.set('numOfDays', '1');
    url.searchParams.set('dimension1', 'Browser');
    if (projectId) url.searchParams.set('projectId', projectId);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Clarity ${res.status}: ${body.slice(0, 200) || res.statusText}`);
    }
    return {
      source: 'clarity-data-export',
      numOfDays: 1,
      dimension: 'Browser',
      data: await res.json(),
      note: 'Clarity solo expone los últimos 1–3 días y máximo 10 requests/día.',
    };
  }

  private async fetchMeta(pixelId: string, accessToken: string) {
    const since = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
    const until = Math.floor(Date.now() / 1000);
    const infoUrl = new URL(`https://graph.facebook.com/v21.0/${pixelId}`);
    infoUrl.searchParams.set('fields', 'name,id,is_unavailable');
    infoUrl.searchParams.set('access_token', accessToken);

    const statsUrl = new URL(`https://graph.facebook.com/v21.0/${pixelId}/stats`);
    statsUrl.searchParams.set('aggregation', 'event');
    statsUrl.searchParams.set('start_time', String(since));
    statsUrl.searchParams.set('end_time', String(until));
    statsUrl.searchParams.set('access_token', accessToken);

    const [infoRes, statsRes] = await Promise.all([
      fetch(infoUrl.toString()),
      fetch(statsUrl.toString()),
    ]);

    const info = infoRes.ok ? await infoRes.json() : null;
    const stats = statsRes.ok ? await statsRes.json() : null;
    if (!infoRes.ok && !statsRes.ok) {
      const err = await infoRes.text().catch(() => infoRes.statusText);
      throw new Error(`Meta Graph ${infoRes.status}: ${err.slice(0, 200)}`);
    }
    return {
      source: 'meta-graph',
      periodDays: 7,
      pixel: info,
      stats,
      note: !statsRes.ok
        ? 'Pixel verificado, pero no se pudieron leer stats (revisa permisos ads_management del token).'
        : undefined,
    };
  }

  private async fetchTiktok(pixelId: string, accessToken: string) {
    const res = await fetch(
      'https://business-api.tiktok.com/open_api/v1.3/pixel/list/',
      {
        method: 'GET',
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      code?: number;
      message?: string;
      data?: { pixels?: Array<{ pixel_id?: string; pixel_name?: string; status?: string }> };
    };
    if (!res.ok || (json.code !== undefined && json.code !== 0)) {
      throw new Error(
        `TikTok ${res.status}: ${json.message || res.statusText}`,
      );
    }
    const pixels = json.data?.pixels || [];
    const match = pixels.find((p) => String(p.pixel_id) === String(pixelId));
    return {
      source: 'tiktok-business-api',
      pixel: match || { pixel_id: pixelId, note: 'No listado en la cuenta del token' },
      pixelsCount: pixels.length,
      note: 'Listado de píxeles de la cuenta. Métricas de eventos detalladas requieren Advertiser ID y reportes de ads.',
    };
  }
}
