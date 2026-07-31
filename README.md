# JustTime CMS API

API NestJS del gestor de contenido (schema `cms` en PostgreSQL).

## Requisitos

- Node.js LTS + **pnpm** (`corepack enable`)
- PostgreSQL (ver `docker-compose.yml` en la raíz del workspace, puerto **5433**)

## Arranque (solo pnpm)

```bash
# desde la raíz del workspace
docker compose up -d

cd just-time-cms-api
cp .env.example .env
pnpm install
pnpm prisma:migrate
pnpm dev
```

API: `http://localhost:3002/v1`

```bash
cp .env.production.example .env.production.local
pnpm dev:prod       # local con credenciales de prod
pnpm deploy:dev     # Cloud Run *-dev
pnpm deploy:prod    # Cloud Run prod
```

## Admin bootstrap

- Email: `admin@justtime.co`
- Password: `Admin123!`

## Módulos

Noticias, píldoras, servicios, proyectos de venta, páginas/bloques, media, leads, settings, SEO, auth local (mientras llega `just-time-auth`).

`GET /v1/sitemap` devuelve las rutas públicas publicadas con `lastmod`,
`changefreq`, `priority` y los metadatos del `<head>` (`title`, `description`,
`image`, `type`). `just-time-web` la usa al construir para generar `sitemap.xml` y
prerenderizar el head de cada ruta. El mapa slug→ruta vive en
`src/seo/seo.service.ts` y debe seguir a las rutas de `just-time-web/src/App.tsx`.
