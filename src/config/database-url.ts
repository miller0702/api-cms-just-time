/**
 * Prisma exige DATABASE_URL. Si hay DB_HOST/DB_USER/…, la armamos aquí.
 *
 * Supabase:
 * - Runtime: pooler Transaction (6543) + pgbouncer=true + connection_limit bajo
 * - Migraciones: Session (5432) sin pgbouncer
 */
export type BuildDbUrlOptions = {
  /** Forzar puerto (p. ej. migraciones en 5432). */
  port?: string
  /** Forzar modo pgbouncer. */
  pgbouncer?: boolean
  /** Límite de conexiones del cliente Prisma. */
  connectionLimit?: number
}

export function buildDatabaseUrl(options: BuildDbUrlOptions = {}): string | undefined {
  const host = process.env.DB_HOST?.trim()
  const user = process.env.DB_USER?.trim()
  const password = process.env.DB_PASSWORD ?? ''
  const database = process.env.DB_NAME?.trim() || 'postgres'
  const port =
    options.port?.trim() ||
    process.env.DB_PORT?.trim() ||
    '6543'
  const schema = process.env.DB_SCHEMA?.trim() || 'cms'
  const sslmode = process.env.DB_SSLMODE?.trim() || 'require'
  const pgbouncer =
    options.pgbouncer ??
    (process.env.DB_PGBOUNCER
      ? process.env.DB_PGBOUNCER !== '0' && process.env.DB_PGBOUNCER !== 'false'
      : port === '6543')
  const connectionLimit =
    options.connectionLimit ??
    Number(process.env.DB_CONNECTION_LIMIT || (pgbouncer ? 1 : 5))

  if (!host || !user) {
    return process.env.DATABASE_URL
  }

  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
  const params = new URLSearchParams()
  params.set('schema', schema)
  params.set('sslmode', sslmode)
  if (pgbouncer) params.set('pgbouncer', 'true')
  if (Number.isFinite(connectionLimit) && connectionLimit > 0) {
    params.set('connection_limit', String(connectionLimit))
  }

  return `postgresql://${auth}@${host}:${port}/${database}?${params.toString()}`
}

export function applyDatabaseUrlFromParts(
  options: BuildDbUrlOptions = {},
): string | undefined {
  const url = buildDatabaseUrl(options)
  if (url) process.env.DATABASE_URL = url
  return url || process.env.DATABASE_URL
}
