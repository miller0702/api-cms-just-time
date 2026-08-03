import * as geoip from 'geoip-lite';

export type GeoLookup = {
  country: string;
  region: string | null;
  city: string | null;
  lat: number;
  lon: number;
};

/** Normaliza IPv4-mapped IPv6 y descarta loopback / privadas sin geo útil. */
export function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  let value = ip.trim();
  if (value.startsWith('::ffff:')) value = value.slice(7);
  if (value === '::1' || value === '127.0.0.1') return null;
  if (
    value.startsWith('10.') ||
    value.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(value)
  ) {
    return null;
  }
  return value;
}

export function lookupIp(ip: string | null | undefined): GeoLookup | null {
  const normalized = normalizeIp(ip);
  if (!normalized) return null;
  const hit = geoip.lookup(normalized);
  if (!hit?.country) return null;
  const [lat, lon] = hit.ll ?? [0, 0];
  return {
    country: hit.country,
    region: hit.region || null,
    city: hit.city || null,
    lat,
    lon,
  };
}

/** Nombres ISO 3166-1 alpha-2 (subset + fallback al código). */
const COUNTRY_NAMES: Record<string, string> = {
  CO: 'Colombia',
  US: 'Estados Unidos',
  MX: 'México',
  BR: 'Brasil',
  AR: 'Argentina',
  CL: 'Chile',
  PE: 'Perú',
  EC: 'Ecuador',
  VE: 'Venezuela',
  PA: 'Panamá',
  CR: 'Costa Rica',
  ES: 'España',
  DE: 'Alemania',
  FR: 'Francia',
  GB: 'Reino Unido',
  IT: 'Italia',
  CA: 'Canadá',
  AU: 'Australia',
  CN: 'China',
  IN: 'India',
  JP: 'Japón',
  KR: 'Corea del Sur',
  NL: 'Países Bajos',
  PT: 'Portugal',
  DO: 'República Dominicana',
  CU: 'Cuba',
  GT: 'Guatemala',
  HN: 'Honduras',
  SV: 'El Salvador',
  NI: 'Nicaragua',
  BO: 'Bolivia',
  PY: 'Paraguay',
  UY: 'Uruguay',
};

/** Departamentos Colombia (códigos MaxMind / ISO 3166-2 sin prefijo CO-). */
export const COLOMBIA_REGIONS: Record<
  string,
  { name: string; lat: number; lon: number }
> = {
  AMA: { name: 'Amazonas', lat: -1.44, lon: -71.57 },
  ANT: { name: 'Antioquia', lat: 6.25, lon: -75.56 },
  ARA: { name: 'Arauca', lat: 7.08, lon: -70.76 },
  ATL: { name: 'Atlántico', lat: 10.96, lon: -74.8 },
  BOL: { name: 'Bolívar', lat: 10.4, lon: -75.5 },
  BOY: { name: 'Boyacá', lat: 5.53, lon: -73.36 },
  CAL: { name: 'Caldas', lat: 5.07, lon: -75.52 },
  CAQ: { name: 'Caquetá', lat: 1.61, lon: -75.61 },
  CAS: { name: 'Casanare', lat: 5.34, lon: -72.4 },
  CAU: { name: 'Cauca', lat: 2.44, lon: -76.61 },
  CES: { name: 'Cesar', lat: 9.31, lon: -73.62 },
  CHO: { name: 'Chocó', lat: 5.69, lon: -76.66 },
  COR: { name: 'Córdoba', lat: 8.75, lon: -75.88 },
  CUN: { name: 'Cundinamarca', lat: 4.92, lon: -74.0 },
  DC: { name: 'Bogotá D.C.', lat: 4.65, lon: -74.06 },
  GUA: { name: 'Guainía', lat: 2.57, lon: -68.75 },
  GUV: { name: 'Guaviare', lat: 2.57, lon: -72.64 },
  HUI: { name: 'Huila', lat: 2.93, lon: -75.28 },
  LAG: { name: 'La Guajira', lat: 11.54, lon: -72.91 },
  MAG: { name: 'Magdalena', lat: 10.42, lon: -74.4 },
  MET: { name: 'Meta', lat: 4.15, lon: -73.63 },
  NAR: { name: 'Nariño', lat: 1.21, lon: -77.28 },
  NSA: { name: 'Norte de Santander', lat: 7.89, lon: -72.51 },
  PUT: { name: 'Putumayo', lat: 0.87, lon: -75.67 },
  QUI: { name: 'Quindío', lat: 4.53, lon: -75.68 },
  RIS: { name: 'Risaralda', lat: 4.81, lon: -75.74 },
  SAN: { name: 'Santander', lat: 7.12, lon: -73.12 },
  SAP: { name: 'San Andrés', lat: 12.58, lon: -81.7 },
  SUC: { name: 'Sucre', lat: 9.3, lon: -75.4 },
  TOL: { name: 'Tolima', lat: 4.44, lon: -75.24 },
  VAC: { name: 'Valle del Cauca', lat: 3.45, lon: -76.53 },
  VAU: { name: 'Vaupés', lat: 0.87, lon: -70.35 },
  VID: { name: 'Vichada', lat: 5.0, lon: -68.0 },
};

/** Centroides aproximados por país (ISO2). */
const COUNTRY_CENTROIDS: Record<string, { lat: number; lon: number }> = {
  CO: { lat: 4.57, lon: -74.3 },
  US: { lat: 39.83, lon: -98.58 },
  MX: { lat: 23.63, lon: -102.55 },
  BR: { lat: -14.24, lon: -51.93 },
  AR: { lat: -38.42, lon: -63.62 },
  CL: { lat: -35.68, lon: -71.54 },
  PE: { lat: -9.19, lon: -75.02 },
  EC: { lat: -1.83, lon: -78.18 },
  VE: { lat: 6.42, lon: -66.59 },
  PA: { lat: 8.54, lon: -80.78 },
  CR: { lat: 9.75, lon: -83.75 },
  ES: { lat: 40.46, lon: -3.75 },
  DE: { lat: 51.17, lon: 10.45 },
  FR: { lat: 46.23, lon: 2.21 },
  GB: { lat: 55.38, lon: -3.44 },
  IT: { lat: 41.87, lon: 12.57 },
  CA: { lat: 56.13, lon: -106.35 },
  AU: { lat: -25.27, lon: 133.78 },
  CN: { lat: 35.86, lon: 104.2 },
  IN: { lat: 20.59, lon: 78.96 },
  JP: { lat: 36.2, lon: 138.25 },
  KR: { lat: 35.91, lon: 127.77 },
  NL: { lat: 52.13, lon: 5.29 },
  PT: { lat: 39.4, lon: -8.22 },
  DO: { lat: 18.74, lon: -70.16 },
  CU: { lat: 21.52, lon: -77.78 },
  GT: { lat: 15.78, lon: -90.23 },
  HN: { lat: 15.2, lon: -86.24 },
  SV: { lat: 13.79, lon: -88.9 },
  NI: { lat: 12.87, lon: -85.21 },
  BO: { lat: -16.29, lon: -63.59 },
  PY: { lat: -23.44, lon: -58.44 },
  UY: { lat: -32.52, lon: -55.77 },
};

export function countryName(code: string): string {
  return COUNTRY_NAMES[code] || code;
}

export function countryCentroid(code: string): { lat: number; lon: number } {
  return COUNTRY_CENTROIDS[code] || { lat: 0, lon: 0 };
}
