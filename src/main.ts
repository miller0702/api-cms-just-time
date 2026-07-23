import { config as loadEnv } from 'dotenv'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { join } from 'path'
import { applyDatabaseUrlFromParts } from './config/database-url'
import { AppModule } from './app.module'

loadEnv()
// Runtime: Transaction pooler (6543) para no agotar el cupo Session (15).
applyDatabaseUrlFromParts()

/** `*` + credentials no es válido en el browser; `true` refleja el Origin de la request. */
function resolveCorsOrigin(): boolean | string | string[] {
  const raw = process.env.CORS_ORIGIN?.trim()
  if (!raw || raw === '*') return true
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return list.length <= 1 ? list[0] || true : list
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  app.setGlobalPrefix('v1')
  app.enableCors({
    origin: resolveCorsOrigin(),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  })
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )
  // Disco local solo si no hay bucket GCS (dev / fallback)
  if (!process.env.GCS_BUCKET?.trim()) {
    app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' })
  }
  const port = Number(process.env.PORT ?? 3002)
  // Cloud Run exige 0.0.0.0; sin host puede no recibir el health check.
  await app.listen(port, '0.0.0.0')
  console.log(`API listening on 0.0.0.0:${port}`)
}
bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err)
  process.exit(1)
})
