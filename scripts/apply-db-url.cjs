/**
 * Precarga .env y arma DATABASE_URL desde DB_* (para CLI de Prisma / Nest).
 */
const { config } = require('dotenv')
const { resolve } = require('path')

config({ path: resolve(process.cwd(), '.env') })

function buildDatabaseUrl(options = {}) {
  const host = (process.env.DB_HOST || '').trim()
  const user = (process.env.DB_USER || '').trim()
  const password = process.env.DB_PASSWORD || ''
  const database = (process.env.DB_NAME || 'postgres').trim()
  const port = String(options.port || process.env.DB_PORT || '6543').trim()
  const schema = (process.env.DB_SCHEMA || 'cms').trim()
  const sslmode = (process.env.DB_SSLMODE || 'require').trim()
  const pgbouncer =
    options.pgbouncer != null
      ? options.pgbouncer
      : process.env.DB_PGBOUNCER
        ? process.env.DB_PGBOUNCER !== '0' && process.env.DB_PGBOUNCER !== 'false'
        : port === '6543'
  const connectionLimit = Number(
    options.connectionLimit ||
      process.env.DB_CONNECTION_LIMIT ||
      (pgbouncer ? 1 : 5),
  )

  if (!host || !user) return process.env.DATABASE_URL

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

const args = process.argv.slice(2)
const isMigrate = args.some((a) => a === 'migrate' || a.startsWith('migrate'))
const url = buildDatabaseUrl(
  isMigrate
    ? { port: process.env.DB_MIGRATE_PORT || '5432', pgbouncer: false, connectionLimit: 1 }
    : {},
)
if (url) process.env.DATABASE_URL = url

module.exports = { buildDatabaseUrl }
