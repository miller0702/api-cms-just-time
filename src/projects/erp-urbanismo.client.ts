import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

type ErpFetchInit = {
  method?: 'GET' | 'POST';
  body?: unknown;
  idempotencyKey?: string;
};

/**
 * Cliente HTTP hacia just-time-admin-api (vitrina pública Urbanismo).
 * Si ERP_API_BASE_URL no está configurado, los métodos retornan null.
 */
@Injectable()
export class ErpUrbanismoClient {
  private readonly logger = new Logger(ErpUrbanismoClient.name);
  private readonly baseUrl = (process.env.ERP_API_BASE_URL || '').replace(
    /\/$/,
    '',
  );

  get configured() {
    return Boolean(this.baseUrl);
  }

  private async fetchJson<T>(
    path: string,
    init: ErpFetchInit = {},
  ): Promise<T> {
    if (!this.baseUrl) {
      throw new ServiceUnavailableException(
        'ERP_API_BASE_URL no configurado en el CMS',
      );
    }
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (init.idempotencyKey) {
      headers['Idempotency-Key'] = init.idempotencyKey;
    }
    let res: Response;
    try {
      res = await fetch(url, {
        method: init.method ?? 'GET',
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
    } catch (err) {
      this.logger.warn(`ERP unreachable ${url}: ${err}`);
      throw new BadGatewayException('No se pudo contactar el ERP');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.warn(`ERP ${res.status} ${url}: ${text.slice(0, 200)}`);
      throw new BadGatewayException(text || `ERP respondió ${res.status}`);
    }
    return (await res.json()) as T;
  }

  getProject(erpProjectId: string) {
    return this.fetchJson<Record<string, unknown>>(
      `/v1/projects/${erpProjectId}`,
    );
  }

  getLots(erpProjectId: string) {
    return this.fetchJson<unknown[]>(`/v1/projects/${erpProjectId}/lots`);
  }

  getMap(erpProjectId: string) {
    return this.fetchJson<Record<string, unknown>>(
      `/v1/projects/${erpProjectId}/map`,
    );
  }

  /** Descarga el SVG del ERP (para mapa interactivo sin CORS en el browser). */
  async getMapSvgText(svgUrl: string): Promise<string | null> {
    if (!this.baseUrl || !svgUrl) return null;
    const url = svgUrl.startsWith('http')
      ? svgUrl
      : `${this.baseUrl}${svgUrl.startsWith('/') ? svgUrl : `/${svgUrl}`}`;
    try {
      const res = await fetch(url, {
        headers: { Accept: 'image/svg+xml,text/plain,*/*' },
      });
      if (!res.ok) return null;
      return await res.text();
    } catch (err) {
      this.logger.warn(`SVG fetch failed ${url}: ${err}`);
      return null;
    }
  }

  createInterest(
    erpProjectId: string,
    lotId: string,
    body: Record<string, unknown>,
    idempotencyKey?: string,
  ) {
    return this.fetchJson(
      `/v1/projects/${erpProjectId}/lots/${lotId}/interests`,
      {
        method: 'POST',
        body,
        idempotencyKey:
          idempotencyKey || `cms-lead-${erpProjectId}-${lotId}-${Date.now()}`,
      },
    );
  }

  listFleetTypes() {
    return this.fetchJson<
      Array<{
        id: string;
        code: string;
        name: string;
        category?: string | null;
        description?: string | null;
      }>
    >('/v1/fleet/public/types');
  }

  createFleetAvailabilityLead(
    body: Record<string, unknown>,
    idempotencyKey?: string,
  ) {
    return this.fetchJson('/v1/fleet/public/availability-leads', {
      method: 'POST',
      body,
      idempotencyKey: idempotencyKey || `cms-fleet-lead-${Date.now()}`,
    });
  }
}
