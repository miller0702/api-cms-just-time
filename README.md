# JustTime CMS API

API NestJS del gestor de contenido (schema `cms` en PostgreSQL).

## Requisitos

- Node.js LTS
- PostgreSQL (ver `docker-compose.yml` en la raíz del workspace, puerto **5433**)

## Arranque

```bash
# desde la raíz del workspace
docker compose up -d

cd just-time-cms-api
cp .env.example .env   # si aplica
npx prisma migrate dev
npm run start:dev
```

API: `http://localhost:3002/v1`

## Admin bootstrap

- Email: `admin@justtime.co`
- Password: `Admin123!`

## Módulos

Noticias, píldoras, servicios, proyectos de venta, páginas/bloques, media, leads, settings, auth local (mientras llega `just-time-auth`).
