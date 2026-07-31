import { Injectable } from '@nestjs/common';
import { PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type SitemapEntry = {
  path: string;
  lastmod: string | null;
  changefreq: 'daily' | 'weekly' | 'monthly';
  priority: number;
  /** Metadatos para prerender del `<head>` en el front. */
  title: string | null;
  description: string | null;
  /** Ruta o URL de la imagen Open Graph; el consumidor la vuelve absoluta. */
  image: string | null;
  type: 'website' | 'article';
};

/**
 * Slugs del CMS que la SPA sirve en una ruta propia; el resto cae en /p/:slug.
 * Debe seguir a las rutas de `just-time-web/src/App.tsx`.
 */
const PAGE_ROUTES: Record<string, string> = {
  home: '/',
  urbanismo: '/urbanismo',
  hidrocarburos: '/hidrocarburos',
  proyectos: '/proyectos',
  nosotros: '/nosotros',
  contacto: '/contacto',
};

/** Índices sin contenido propio en el CMS. */
const STATIC_ENTRIES: Array<
  Pick<
    SitemapEntry,
    'path' | 'changefreq' | 'priority' | 'title' | 'description'
  >
> = [
  {
    path: '/noticias',
    changefreq: 'daily',
    priority: 0.7,
    title: 'Noticias',
    description: 'Novedades de obra, territorio y operación de Just Time.',
  },
  {
    path: '/pildoras',
    changefreq: 'weekly',
    priority: 0.6,
    title: 'Píldoras',
    description: 'Contenido técnico breve para obra y operación.',
  },
  {
    path: '/pqrs',
    changefreq: 'monthly',
    priority: 0.4,
    title: 'PQRS',
    description:
      'Radica peticiones, quejas, reclamos, sugerencias o felicitaciones y consulta el estado con tu código de seguimiento.',
  },
  {
    path: '/privacidad',
    changefreq: 'monthly',
    priority: 0.2,
    title: 'Política de privacidad',
    description: 'Política de privacidad de Just Time S.A.S.',
  },
  {
    path: '/cookies',
    changefreq: 'monthly',
    priority: 0.2,
    title: 'Política de cookies',
    description: 'Política de cookies de Just Time S.A.S.',
  },
  {
    path: '/terminos',
    changefreq: 'monthly',
    priority: 0.2,
    title: 'Términos y condiciones',
    description: 'Términos y condiciones de Just Time S.A.S.',
  },
];

function iso(date: Date | null | undefined) {
  return date ? date.toISOString() : null;
}

/** Los cuerpos del CMS traen HTML; el `<head>` necesita texto plano. */
function metaText(value: string | null | undefined, max = 160) {
  if (!value) return null;
  const plain = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return null;
  return plain.length <= max ? plain : `${plain.slice(0, max - 1).trimEnd()}…`;
}

@Injectable()
export class SeoService {
  constructor(private readonly prisma: PrismaService) {}

  async sitemap(): Promise<{ generatedAt: string; entries: SitemapEntry[] }> {
    const published = { status: PublishStatus.published };
    const coverSelect = { select: { url: true } };
    const [pages, services, projects, news, pills] = await Promise.all([
      this.prisma.page.findMany({
        where: published,
        select: {
          slug: true,
          title: true,
          seoTitle: true,
          seoDescription: true,
          seoImageUrl: true,
          updatedAt: true,
        },
      }),
      this.prisma.service.findMany({
        where: published,
        select: {
          slug: true,
          title: true,
          summary: true,
          seoTitle: true,
          seoDescription: true,
          seoImageUrl: true,
          media: coverSelect,
          updatedAt: true,
        },
      }),
      this.prisma.saleProject.findMany({
        where: published,
        select: {
          slug: true,
          name: true,
          summary: true,
          seoTitle: true,
          seoDescription: true,
          seoImageUrl: true,
          coverMedia: coverSelect,
          updatedAt: true,
        },
      }),
      this.prisma.news.findMany({
        where: published,
        select: {
          slug: true,
          title: true,
          excerpt: true,
          seoTitle: true,
          seoDescription: true,
          seoImageUrl: true,
          coverMedia: coverSelect,
          updatedAt: true,
        },
      }),
      this.prisma.pill.findMany({
        where: published,
        select: {
          slug: true,
          title: true,
          summary: true,
          seoTitle: true,
          seoDescription: true,
          seoImageUrl: true,
          coverMedia: coverSelect,
          updatedAt: true,
        },
      }),
    ]);

    const entries: SitemapEntry[] = [];

    for (const page of pages) {
      const path = PAGE_ROUTES[page.slug] ?? `/p/${page.slug}`;
      entries.push({
        path,
        lastmod: iso(page.updatedAt),
        changefreq: path === '/' ? 'weekly' : 'monthly',
        priority: path === '/' ? 1 : 0.8,
        title: page.seoTitle || page.title,
        description: metaText(page.seoDescription),
        image: page.seoImageUrl,
        type: 'website',
      });
    }

    for (const entry of STATIC_ENTRIES) {
      entries.push({ ...entry, lastmod: null, image: null, type: 'website' });
    }

    for (const service of services) {
      entries.push({
        path: `/servicios/${service.slug}`,
        lastmod: iso(service.updatedAt),
        changefreq: 'monthly',
        priority: 0.7,
        title: service.seoTitle || service.title,
        description: metaText(service.seoDescription || service.summary),
        image: service.seoImageUrl || service.media?.url || null,
        type: 'website',
      });
    }

    for (const project of projects) {
      entries.push({
        path: `/proyectos/${project.slug}`,
        lastmod: iso(project.updatedAt),
        changefreq: 'weekly',
        priority: 0.8,
        title: project.seoTitle || project.name,
        description: metaText(project.seoDescription || project.summary),
        image: project.seoImageUrl || project.coverMedia?.url || null,
        type: 'website',
      });
    }

    for (const item of news) {
      entries.push({
        path: `/noticias/${item.slug}`,
        lastmod: iso(item.updatedAt),
        changefreq: 'monthly',
        priority: 0.6,
        title: item.seoTitle || item.title,
        description: metaText(item.seoDescription || item.excerpt),
        image: item.seoImageUrl || item.coverMedia?.url || null,
        type: 'article',
      });
    }

    for (const item of pills) {
      entries.push({
        path: `/pildoras/${item.slug}`,
        lastmod: iso(item.updatedAt),
        changefreq: 'monthly',
        priority: 0.5,
        title: item.seoTitle || item.title,
        description: metaText(item.seoDescription || item.summary),
        image: item.seoImageUrl || item.coverMedia?.url || null,
        type: 'article',
      });
    }

    const seen = new Set<string>();
    const unique = entries.filter((entry) => {
      if (seen.has(entry.path)) return false;
      seen.add(entry.path);
      return true;
    });

    return { generatedAt: new Date().toISOString(), entries: unique };
  }
}
