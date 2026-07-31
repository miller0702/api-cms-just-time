import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type TrackingProvider = 'googleAnalytics' | 'meta' | 'tiktok' | 'clarity';

export type TrackingSettings = {
  googleAnalytics?: {
    measurementId?: string;
    propertyId?: string;
    /** Service account JSON o API secret (solo admin) */
    apiToken?: string;
  };
  meta?: {
    pixelId?: string;
    accessToken?: string;
  };
  tiktok?: {
    pixelId?: string;
    accessToken?: string;
  };
  clarity?: {
    projectId?: string;
    apiToken?: string;
  };
};

const SECRET_KEYS = ['apiToken', 'accessToken'] as const;

function stripSecrets(tracking: TrackingSettings | null | undefined): TrackingSettings {
  if (!tracking || typeof tracking !== 'object') return {};
  const out: TrackingSettings = {};
  for (const provider of [
    'googleAnalytics',
    'meta',
    'tiktok',
    'clarity',
  ] as TrackingProvider[]) {
    const src = tracking[provider];
    if (!src || typeof src !== 'object') continue;
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(src)) {
      if (SECRET_KEYS.includes(k as (typeof SECRET_KEYS)[number])) continue;
      if (typeof v === 'string' && v.trim()) clean[k] = v.trim();
    }
    if (Object.keys(clean).length) out[provider] = clean as never;
  }
  return out;
}

/** Vista admin: secretos → flags has* sin filtrar el valor. */
export function maskTrackingForAdmin(tracking: TrackingSettings | null | undefined) {
  const raw = tracking && typeof tracking === 'object' ? tracking : {};
  return {
    googleAnalytics: {
      measurementId: raw.googleAnalytics?.measurementId?.trim() || '',
      propertyId: raw.googleAnalytics?.propertyId?.trim() || '',
      hasApiToken: Boolean(raw.googleAnalytics?.apiToken?.trim()),
      apiToken: '',
    },
    meta: {
      pixelId: raw.meta?.pixelId?.trim() || '',
      hasAccessToken: Boolean(raw.meta?.accessToken?.trim()),
      accessToken: '',
    },
    tiktok: {
      pixelId: raw.tiktok?.pixelId?.trim() || '',
      hasAccessToken: Boolean(raw.tiktok?.accessToken?.trim()),
      accessToken: '',
    },
    clarity: {
      projectId: raw.clarity?.projectId?.trim() || '',
      hasApiToken: Boolean(raw.clarity?.apiToken?.trim()),
      apiToken: '',
    },
  };
}

function mergeProvider<T extends Record<string, unknown>>(
  prev: T | undefined,
  next: T | undefined,
  secretFields: string[],
): T | undefined {
  if (!next && !prev) return undefined;
  const merged: Record<string, unknown> = { ...(prev || {}), ...(next || {}) };
  for (const field of secretFields) {
    const incoming = next?.[field];
    if (typeof incoming === 'string') {
      const trimmed = incoming.trim();
      if (trimmed === '') {
        // Campo vacío en el form: conservar el anterior
        if (prev?.[field]) merged[field] = prev[field];
        else delete merged[field];
      } else if (trimmed === '__CLEAR__') {
        delete merged[field];
      } else {
        merged[field] = trimmed;
      }
    }
  }
  // Limpiar strings vacíos de campos públicos
  for (const [k, v] of Object.entries(merged)) {
    if (typeof v === 'string' && !v.trim()) delete merged[k];
  }
  return Object.keys(merged).length ? (merged as T) : undefined;
}

export function mergeTrackingSettings(
  previous: TrackingSettings | null | undefined,
  incoming: TrackingSettings | null | undefined,
): TrackingSettings {
  const prev = previous && typeof previous === 'object' ? previous : {};
  const next = incoming && typeof incoming === 'object' ? incoming : {};
  const result: TrackingSettings = {};

  const ga = mergeProvider(prev.googleAnalytics, next.googleAnalytics, ['apiToken']);
  if (ga) result.googleAnalytics = ga as TrackingSettings['googleAnalytics'];

  const meta = mergeProvider(prev.meta, next.meta, ['accessToken']);
  if (meta) result.meta = meta as TrackingSettings['meta'];

  const tiktok = mergeProvider(prev.tiktok, next.tiktok, ['accessToken']);
  if (tiktok) result.tiktok = tiktok as TrackingSettings['tiktok'];

  const clarity = mergeProvider(prev.clarity, next.clarity, ['apiToken']);
  if (clarity) result.clarity = clarity as TrackingSettings['clarity'];

  return result;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublic() {
    const rows = await this.prisma.siteSetting.findMany();
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    if (map.tracking) {
      map.tracking = stripSecrets(map.tracking as TrackingSettings);
    }
    return map;
  }

  async upsert(key: string, value: unknown) {
    if (key === 'tracking') {
      const existing = await this.prisma.siteSetting.findUnique({
        where: { key: 'tracking' },
      });
      const merged = mergeTrackingSettings(
        (existing?.value as TrackingSettings) || {},
        value as TrackingSettings,
      );
      return this.prisma.siteSetting.upsert({
        where: { key: 'tracking' },
        create: { key: 'tracking', value: merged as object },
        update: { value: merged as object },
      });
    }
    return this.prisma.siteSetting.upsert({
      where: { key },
      create: { key, value: value as object },
      update: { value: value as object },
    });
  }

  listAdmin() {
    return this.prisma.siteSetting.findMany({ orderBy: { key: 'asc' } });
  }

  async getTrackingRaw(): Promise<TrackingSettings> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { key: 'tracking' },
    });
    return ((row?.value as TrackingSettings) || {}) as TrackingSettings;
  }

  async getTrackingAdmin() {
    return maskTrackingForAdmin(await this.getTrackingRaw());
  }
}
