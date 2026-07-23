import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PublishStatus, ServiceLine, Prisma } from '@prisma/client';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { AuthModule } from './auth/auth.module';
import { NewsModule } from './news/news.module';
import { PillsModule } from './pills/pills.module';
import { ServicesContentModule } from './services-content/services-content.module';
import { ProjectsModule } from './projects/projects.module';
import { PagesModule } from './pages/pages.module';
import { MediaModule } from './media/media.module';
import { LeadsModule } from './leads/leads.module';
import { SettingsModule } from './settings/settings.module';
import { EngagementModule } from './engagement/engagement.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RolesService } from './roles/roles.service';
import { systemRoleSeeds } from './auth/permissions';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    NewsModule,
    PillsModule,
    ServicesContentModule,
    ProjectsModule,
    PagesModule,
    MediaModule,
    LeadsModule,
    SettingsModule,
    EngagementModule,
    RolesModule,
    UsersModule,
    NotificationsModule,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
  ) {}

  async onModuleInit() {
    try {
      await this.seed();
    } catch (err) {
      // No tumbar el proceso en Cloud Run por un seed fallido (DB/timeout).
      console.error('[seed] Falló el seed al arrancar:', err);
    }
  }

  private async seed() {
    await this.roles.ensureSystemRoles();

    const email = (process.env.ADMIN_EMAIL ?? 'admin@justtime.co').toLowerCase();
    const superRole = await this.roles.getBySlug('superadmin');
    if (!superRole) {
      throw new Error('[seed] Rol superadmin no encontrado');
    }

    const existing = await this.prisma.adminUser.findUnique({
      where: { email },
      include: { roleDef: true },
    });
    if (!existing) {
      await this.prisma.adminUser.create({
        data: {
          email,
          name: process.env.ADMIN_NAME ?? 'Superadmin CMS',
          roleId: superRole.id,
          passwordHash: await bcrypt.hash(
            process.env.ADMIN_PASSWORD ?? 'Admin123!',
            10,
          ),
        },
      });
    } else {
      try {
        const superCount = await this.prisma.adminUser.count({
          where: { roleDef: { slug: 'superadmin' } },
        });
        if (superCount === 0) {
          await this.prisma.adminUser.update({
            where: { email },
            data: { roleId: superRole.id },
          });
        }
      } catch (err) {
        console.warn('[seed] No se pudo promover superadmin:', err);
      }
    }

    // Restaura permisos vacíos en roles sistema (excepto superadmin, ya forzado)
    for (const seed of systemRoleSeeds()) {
      if (seed.slug === 'superadmin') continue;
      const role = await this.prisma.adminRoleDef.findUnique({
        where: { slug: seed.slug },
      });
      if (role && role.isSystem && role.permissions.length === 0) {
        await this.prisma.adminRoleDef.update({
          where: { id: role.id },
          data: { permissions: seed.permissions },
        });
      }
    }

    const settingsCount = await this.prisma.siteSetting.count();
    if (settingsCount === 0) {
      await this.prisma.siteSetting.createMany({
        data: [
          {
            key: 'brand',
            value: {
              name: 'JustTime',
              legalName: 'Just Time S.A.S',
              tagline: 'Desarrollamos el territorio del Caribe colombiano',
              logoLightUrl: null,
              logoDarkUrl: null,
            },
          },
          {
            key: 'theme',
            value: {
              orange: '#f58220',
              orangeDeep: '#e05010',
              red: '#e31b23',
              bgLight: '#f3f3f5',
              bgDark: '#0c0c0d',
              textLight: '#0a0a0a',
              textDark: '#f5f5f7',
            },
          },
          {
            key: 'contact',
            value: {
              email: 'administracion@justtimesas.com',
              emailSecondary: 'operaciones@justtimesas.com',
              phone: '317 607 3815',
              phoneSecondary: '320 636 8550',
              phoneTertiary: '322 909 0156',
              city: 'San Alberto, Cesar — Colombia',
              whatsapp: '573176073815',
              address: 'Calle 5 #5-19, Barrio La Marina',
              addressLine2: 'San Alberto, Cesar — Colombia',
              nit: '901426966-7',
              blurb:
                'Tu aliado estratégico en transporte, maquinaria y desarrollo urbanístico del Caribe colombiano.',
            },
          },
          {
            key: 'navigation',
            value: {
              homeHref: '/',
              ctaLabel: 'Cotizar ahora',
              ctaHref: '/contacto',
              items: [
                { id: 'nav-urbanismo', label: 'Urbanismo', href: '/urbanismo', icon: 'building' },
                { id: 'nav-hidrocarburos', label: 'Hidrocarburos', href: '/hidrocarburos', icon: 'energy' },
                { id: 'nav-proyectos', label: 'Proyectos', href: '/proyectos', icon: 'projects' },
                { id: 'nav-nosotros', label: 'Sobre nosotros', href: '/nosotros', icon: 'team' },
                { id: 'nav-contacto', label: 'Contacto', href: '/contacto', icon: 'mail' },
              ],
            },
          },
          {
            key: 'social',
            value: {
              items: [
                { id: 'whatsapp', href: 'https://wa.me/573176073815', enabled: true },
                { id: 'facebook', href: 'https://facebook.com', enabled: true },
                { id: 'instagram', href: 'https://instagram.com', enabled: true },
                { id: 'linkedin', href: 'https://linkedin.com', enabled: true },
                { id: 'tiktok', href: 'https://tiktok.com', enabled: true },
              ],
            },
          },
          {
            key: 'footer',
            value: {
              columns: [
                {
                  id: 'hidro',
                  title: 'Hidrocarburos',
                  seeAllLabel: 'Ver todos →',
                  seeAllHref: '/hidrocarburos',
                  links: [
                    { id: 'h1', label: 'Maquinaria Amarilla', href: '/servicios/maquinaria-amarilla' },
                    { id: 'h2', label: 'Transporte de Carga', href: '/servicios/transporte-carga' },
                    { id: 'h3', label: 'Izaje de Carga', href: '/servicios/izaje-carga' },
                    { id: 'h4', label: 'Bomba Triplex', href: '/servicios/bomba-triplex' },
                    { id: 'h5', label: 'Camión de Vacío', href: '/servicios/camion-vacio' },
                  ],
                },
                {
                  id: 'urbanismo',
                  title: 'Urbanismo',
                  seeAllLabel: 'Ver todos →',
                  seeAllHref: '/urbanismo',
                  links: [
                    { id: 'u1', label: 'Obras Civiles', href: '/servicios/obras-civiles' },
                    { id: 'u2', label: 'Topografía', href: '/servicios/topografia' },
                    { id: 'u3', label: 'Diseño Arquitectónico', href: '/servicios/diseno-arquitectonico' },
                    { id: 'u4', label: 'Desarrollo de Vías', href: '/servicios/desarrollo-vias' },
                    { id: 'u5', label: 'Fotogrametría', href: '/servicios/fotogrametria' },
                  ],
                },
                {
                  id: 'proyectos',
                  title: 'Proyectos',
                  seeAllLabel: 'Ver proyectos →',
                  seeAllHref: '/proyectos',
                  links: [
                    { id: 'p1', label: 'Magno Country Club', href: '/proyectos/magno-country-club' },
                    { id: 'p2', label: 'El Poblado', href: '/proyectos/el-poblado' },
                    { id: 'p3', label: 'Industrial Park', href: '/proyectos/industrial-park' },
                    { id: 'p4', label: 'Time Country Club', href: '/proyectos/time-country-club' },
                  ],
                },
              ],
            },
          },
          {
            key: 'certifications',
            value: {
              items: [
                { id: 'iso-9001', name: 'ISO 9001', logoUrl: null, alt: 'ISO 9001' },
                { id: 'iso-14001', name: 'ISO 14001', logoUrl: null, alt: 'ISO 14001' },
                { id: 'iso-45001', name: 'ISO 45001', logoUrl: null, alt: 'ISO 45001' },
                { id: 'norsok', name: 'Norsok S-006', logoUrl: null, alt: 'Norsok S-006' },
              ],
            },
          },
          {
            key: 'system',
            value: {
              mode: 'live',
              maintenanceTitle: 'Estamos en mantenimiento',
              maintenanceMessage:
                'Estamos mejorando la plataforma. Vuelve pronto; el equipo ya está trabajando en ello.',
              comingSoonTitle: 'Muy pronto',
              comingSoonMessage:
                'Estamos preparando algo grande. Déjanos tus datos por WhatsApp o correo y te avisamos.',
              notFoundTitle: 'Página no encontrada',
              notFoundMessage:
                'La ruta que buscas no existe o fue movida. Prueba volver al inicio.',
              errorTitle: 'Algo salió mal',
              errorMessage:
                'Ocurrió un error inesperado. Puedes reintentar o volver al inicio.',
              showContactCta: true,
            },
          },
        ],
      });
    } else {
      const certs = await this.prisma.siteSetting.findUnique({
        where: { key: 'certifications' },
      });
      if (!certs) {
        await this.prisma.siteSetting.create({
          data: {
            key: 'certifications',
            value: {
              items: [
                { id: 'iso-9001', name: 'ISO 9001', logoUrl: null, alt: 'ISO 9001' },
                { id: 'iso-14001', name: 'ISO 14001', logoUrl: null, alt: 'ISO 14001' },
                { id: 'iso-45001', name: 'ISO 45001', logoUrl: null, alt: 'ISO 45001' },
                { id: 'norsok', name: 'Norsok S-006', logoUrl: null, alt: 'Norsok S-006' },
              ],
            },
          },
        });
      }
      const theme = await this.prisma.siteSetting.findUnique({
        where: { key: 'theme' },
      });
      if (!theme) {
        await this.prisma.siteSetting.create({
          data: {
            key: 'theme',
            value: {
              orange: '#f58220',
              orangeDeep: '#e05010',
              red: '#e31b23',
              bgLight: '#f3f3f5',
              bgDark: '#0c0c0d',
              textLight: '#0a0a0a',
              textDark: '#f5f5f7',
            },
          },
        });
      }
      const navigation = await this.prisma.siteSetting.findUnique({
        where: { key: 'navigation' },
      });
      if (!navigation) {
        await this.prisma.siteSetting.create({
          data: {
            key: 'navigation',
            value: {
              homeHref: '/',
              ctaLabel: 'Cotizar ahora',
              ctaHref: '/contacto',
              items: [
                { id: 'nav-urbanismo', label: 'Urbanismo', href: '/urbanismo', icon: 'building' },
                { id: 'nav-hidrocarburos', label: 'Hidrocarburos', href: '/hidrocarburos', icon: 'energy' },
                { id: 'nav-proyectos', label: 'Proyectos', href: '/proyectos', icon: 'projects' },
                { id: 'nav-nosotros', label: 'Sobre nosotros', href: '/nosotros', icon: 'team' },
                { id: 'nav-contacto', label: 'Contacto', href: '/contacto', icon: 'mail' },
              ],
            },
          },
        });
      }
      const social = await this.prisma.siteSetting.findUnique({
        where: { key: 'social' },
      });
      if (!social) {
        await this.prisma.siteSetting.create({
          data: {
            key: 'social',
            value: {
              items: [
                { id: 'whatsapp', href: 'https://wa.me/573176073815', enabled: true },
                { id: 'facebook', href: 'https://facebook.com', enabled: true },
                { id: 'instagram', href: 'https://instagram.com', enabled: true },
                { id: 'linkedin', href: 'https://linkedin.com', enabled: true },
                { id: 'tiktok', href: 'https://tiktok.com', enabled: true },
              ],
            },
          },
        });
      }
      const footer = await this.prisma.siteSetting.findUnique({
        where: { key: 'footer' },
      });
      if (!footer) {
        await this.prisma.siteSetting.create({
          data: {
            key: 'footer',
            value: {
              columns: [
                {
                  id: 'hidro',
                  title: 'Hidrocarburos',
                  seeAllLabel: 'Ver todos →',
                  seeAllHref: '/hidrocarburos',
                  links: [
                    { id: 'h1', label: 'Maquinaria Amarilla', href: '/servicios/maquinaria-amarilla' },
                    { id: 'h2', label: 'Transporte de Carga', href: '/servicios/transporte-carga' },
                    { id: 'h3', label: 'Izaje de Carga', href: '/servicios/izaje-carga' },
                    { id: 'h4', label: 'Bomba Triplex', href: '/servicios/bomba-triplex' },
                    { id: 'h5', label: 'Camión de Vacío', href: '/servicios/camion-vacio' },
                  ],
                },
                {
                  id: 'urbanismo',
                  title: 'Urbanismo',
                  seeAllLabel: 'Ver todos →',
                  seeAllHref: '/urbanismo',
                  links: [
                    { id: 'u1', label: 'Obras Civiles', href: '/servicios/obras-civiles' },
                    { id: 'u2', label: 'Topografía', href: '/servicios/topografia' },
                    { id: 'u3', label: 'Diseño Arquitectónico', href: '/servicios/diseno-arquitectonico' },
                    { id: 'u4', label: 'Desarrollo de Vías', href: '/servicios/desarrollo-vias' },
                    { id: 'u5', label: 'Fotogrametría', href: '/servicios/fotogrametria' },
                  ],
                },
                {
                  id: 'proyectos',
                  title: 'Proyectos',
                  seeAllLabel: 'Ver proyectos →',
                  seeAllHref: '/proyectos',
                  links: [
                    { id: 'p1', label: 'Magno Country Club', href: '/proyectos/magno-country-club' },
                    { id: 'p2', label: 'El Poblado', href: '/proyectos/el-poblado' },
                    { id: 'p3', label: 'Industrial Park', href: '/proyectos/industrial-park' },
                    { id: 'p4', label: 'Time Country Club', href: '/proyectos/time-country-club' },
                  ],
                },
              ],
            },
          },
        });
      }
      const system = await this.prisma.siteSetting.findUnique({
        where: { key: 'system' },
      });
      if (!system) {
        await this.prisma.siteSetting.create({
          data: {
            key: 'system',
            value: {
              mode: 'live',
              maintenanceTitle: 'Estamos en mantenimiento',
              maintenanceMessage:
                'Estamos mejorando la plataforma. Vuelve pronto; el equipo ya está trabajando en ello.',
              comingSoonTitle: 'Muy pronto',
              comingSoonMessage:
                'Estamos preparando algo grande. Déjanos tus datos por WhatsApp o correo y te avisamos.',
              notFoundTitle: 'Página no encontrada',
              notFoundMessage:
                'La ruta que buscas no existe o fue movida. Prueba volver al inicio.',
              errorTitle: 'Algo salió mal',
              errorMessage:
                'Ocurrió un error inesperado. Puedes reintentar o volver al inicio.',
              showContactCta: true,
            },
          },
        });
      }
    }

    const legal = await this.prisma.siteSetting.findUnique({
      where: { key: 'legal' },
    });
    if (!legal) {
      await this.prisma.siteSetting.create({
        data: {
          key: 'legal',
          value: {
            privacy: {
              title: 'Política de privacidad',
              html: '<p>En <strong>Just Time S.A.S</strong> tratamos los datos personales que nos facilitas para atender tu solicitud y prestar servicios. Puedes ejercer tus derechos de acceso, actualización o eliminación a través de los canales de contacto del sitio.</p>',
            },
            cookies: {
              title: 'Política de cookies',
              html: '<p>Usamos cookies necesarias para el funcionamiento del sitio y, con tu consentimiento, otras que mejoran la experiencia. Puedes aceptar o limitar cookies no necesarias desde el banner.</p>',
            },
            terms: {
              title: 'Términos y condiciones',
              html: '<p>El acceso y uso del sitio web de <strong>Just Time S.A.S</strong> implica la aceptación de estos términos. La información publicada es comercial e informativa; las condiciones de servicio se confirman por canales oficiales.</p>',
            },
          },
        },
      });
    }

    const homeLayoutBlocks = [
      {
        type: 'hero',
        sortOrder: 0,
        payload: {
          eyebrow: 'JustTime',
          headline: 'Desarrollamos el territorio del Caribe colombiano',
          text: 'Capacidad técnica completa para proyectos urbanos, obras civiles y soluciones energéticas.',
          ctaPrimary: 'Ver proyectos',
          ctaPrimaryHref: '/proyectos',
          ctaSecondary: 'Cotizar',
          ctaSecondaryHref: '/contacto',
          imageMediaId: null,
          imageUrl: null,
        },
      },
      {
        type: 'serviceGrid',
        sortOrder: 1,
        payload: {
          title: 'Urbanismo con capacidad integral',
          line: 'urbanismo',
          limit: 5,
        },
      },
      {
        type: 'serviceBands',
        sortOrder: 2,
        payload: {
          eyebrow: 'Servicios',
          title: 'Soluciones para el sector energético',
          lead: 'Transporte, maquinaria, izaje, residuos y servicios especializados con flota propia.',
          line: 'hidrocarburos',
          limit: 8,
          linkLabel: 'Ver servicios →',
        },
      },
      {
        type: 'projectIndex',
        sortOrder: 3,
        payload: {
          eyebrow: 'Inversión',
          title: 'Proyectos de venta de lotes',
          lead: 'Magno Country Club, El Poblado, Industrial Park y Time Country Club.',
          limit: 8,
          linkLabel: 'Explorar catálogo →',
        },
      },
      {
        type: 'newsPills',
        sortOrder: 4,
        payload: {
          eyebrow: 'Actualidad y conocimiento',
          title: 'Noticias y píldoras',
          lead: 'Lo que pasa en obra y operación, junto a tips técnicos breves para tu equipo.',
          newsLimit: 6,
          pillsLimit: 6,
        },
      },
    ];

    if ((await this.prisma.page.count()) === 0) {
      await this.prisma.page.create({
        data: {
          slug: 'home',
          title: 'Inicio',
          seoDescription:
            'JustTime — urbanismo, obras civiles e hidrocarburos en el Caribe colombiano',
          status: PublishStatus.published,
          publishedAt: new Date(),
          blocks: {
            create: homeLayoutBlocks,
          },
        },
      });
    } else {
      const home = await this.prisma.page.findUnique({
        where: { slug: 'home' },
        include: { blocks: true },
      });
      if (home) {
        const types = new Set(home.blocks.map((b) => b.type));
        const hasNewLayout =
          types.has('serviceBands') &&
          types.has('projectIndex') &&
          types.has('newsPills');
        const hasLegacyLayout =
          types.has('projectGrid') ||
          (types.has('newsList') && !types.has('newsPills')) ||
          home.blocks.some(
            (b) =>
              b.type === 'serviceGrid' &&
              (b.payload as { line?: string } | null)?.line === 'hidrocarburos',
          );
        const needsUpgrade =
          home.blocks.length <= 1 || (!hasNewLayout && hasLegacyLayout);

        if (needsUpgrade) {
          const hero = home.blocks.find((b) => b.type === 'hero');
          await this.prisma.$transaction([
            this.prisma.pageBlock.deleteMany({ where: { pageId: home.id } }),
            this.prisma.pageBlock.createMany({
              data: homeLayoutBlocks.map((block) => ({
                pageId: home.id,
                type: block.type,
                sortOrder: block.sortOrder,
                payload:
                  block.type === 'hero' && hero?.payload
                    ? (hero.payload as object)
                    : (block.payload as object),
              })),
            }),
          ]);
          console.log(
            '[seed] Home actualizado a layouts serviceBands / projectIndex / newsPills',
          );
        } else if (types.has('cta')) {
          // El footer ya cubre el CTA “Hablemos…”.
          await this.prisma.pageBlock.deleteMany({
            where: { pageId: home.id, type: 'cta' },
          });
          console.log('[seed] CTA del home eliminado (ya está en el footer)');
        }
      }
    }

    const sitePages: Array<{
      slug: string;
      title: string;
      seo: string;
      blocks: Array<{ type: string; sortOrder: number; payload: Record<string, unknown> }>;
    }> = [
      {
        slug: 'urbanismo',
        title: 'Urbanismo',
        seo: 'Servicios de urbanismo y obras civiles — Just Time',
        blocks: [
          {
            type: 'hero',
            sortOrder: 0,
            payload: {
              eyebrow: 'Servicios',
              headline: 'Urbanismo',
              text: 'Soluciones técnicas con maquinaria propia y equipo especializado.',
              ctaPrimary: 'Cotizar',
              ctaPrimaryHref: '/contacto',
              ctaSecondary: 'Ver proyectos',
              ctaSecondaryHref: '/proyectos',
              imageMediaId: null,
              imageUrl: null,
            },
          },
          {
            type: 'serviceGrid',
            sortOrder: 1,
            payload: { title: 'Servicios de urbanismo', line: 'urbanismo', limit: 12 },
          },
        ],
      },
      {
        slug: 'hidrocarburos',
        title: 'Hidrocarburos',
        seo: 'Servicios para el sector energético e hidrocarburos — Just Time',
        blocks: [
          {
            type: 'hero',
            sortOrder: 0,
            payload: {
              eyebrow: 'Servicios',
              headline: 'Hidrocarburos',
              text: 'Capacidad logística y técnica para operaciones energéticas.',
              ctaPrimary: 'Cotizar',
              ctaPrimaryHref: '/contacto',
              ctaSecondary: '',
              ctaSecondaryHref: '',
              imageMediaId: null,
              imageUrl: null,
            },
          },
          {
            type: 'serviceGrid',
            sortOrder: 1,
            payload: {
              title: 'Soluciones para el sector energético',
              line: 'hidrocarburos',
              limit: 12,
            },
          },
        ],
      },
      {
        slug: 'proyectos',
        title: 'Proyectos',
        seo: 'Proyectos de venta de lotes — Just Time',
        blocks: [
          {
            type: 'hero',
            sortOrder: 0,
            payload: {
              eyebrow: 'Desarrollos',
              headline: 'Proyectos',
              text: 'Lotes e infraestructura con visión de territorio.',
              ctaPrimary: 'Contactar',
              ctaPrimaryHref: '/contacto',
              ctaSecondary: '',
              ctaSecondaryHref: '',
              imageMediaId: null,
              imageUrl: null,
            },
          },
          {
            type: 'projectGrid',
            sortOrder: 1,
            payload: { title: 'Proyectos de venta de lotes', limit: 12 },
          },
        ],
      },
      {
        slug: 'nosotros',
        title: 'Sobre nosotros',
        seo: 'Conoce a Just Time S.A.S',
        blocks: [
          {
            type: 'hero',
            sortOrder: 0,
            payload: {
              eyebrow: 'Just Time S.A.S',
              headline: 'Sobre nosotros',
              text: 'Aliado estratégico en transporte, maquinaria y desarrollo urbanístico del Caribe colombiano.',
              ctaPrimary: 'Contáctanos',
              ctaPrimaryHref: '/contacto',
              ctaSecondary: '',
              ctaSecondaryHref: '',
              imageMediaId: null,
              imageUrl: null,
            },
          },
          {
            type: 'richText',
            sortOrder: 1,
            payload: {
              html: '<p>Somos una empresa con capacidad técnica completa para proyectos urbanos, obras civiles y soluciones energéticas.</p>',
            },
          },
        ],
      },
      {
        slug: 'contacto',
        title: 'Contacto',
        seo: 'Contacto Just Time — cotiza tu proyecto',
        blocks: [
          {
            type: 'richText',
            sortOrder: 0,
            payload: {
              html: '<p>Cuéntanos sobre tu proyecto o interés en lotes. Respondemos en menos de 2 horas.</p>',
            },
          },
        ],
      },
    ];

    for (const page of sitePages) {
      const exists = await this.prisma.page.findUnique({ where: { slug: page.slug } });
      if (!exists) {
        await this.prisma.page.create({
          data: {
            slug: page.slug,
            title: page.title,
            seoDescription: page.seo,
            status: PublishStatus.published,
            publishedAt: new Date(),
            blocks: {
              create: page.blocks as Prisma.PageBlockCreateWithoutPageInput[],
            },
          },
        });
      }
    }

    if ((await this.prisma.service.count()) === 0) {
      const urbanismo = [
        ['obras-civiles', 'Obras Civiles', 'Urbanizaciones, redes, movimiento de tierras y cimentaciones.', ['Movimiento de tierras', 'Urbanizaciones', 'Redes', 'Cimentaciones']],
        ['topografia', 'Topografía', 'Levantamientos, replanteo, curvas de nivel y cartografía digital.', ['Levantamientos', 'Replanteo', 'Curvas de nivel', 'Cartografía']],
        ['diseno-arquitectonico', 'Diseño Arquitectónico', 'Planos, implantación, renders 3D y gestión de licencias.', ['Planos', 'Renders 3D', 'Licencias', 'Implantación']],
        ['desarrollo-vias', 'Desarrollo de Vías', 'Vías internas, pavimentación, accesos y señalización.', ['Vías internas', 'Pavimentación', 'Accesos', 'Señalización']],
        ['fotogrametria', 'Fotogrametría', 'Modelos 3D y mapas 2D de alta precisión con drone.', ['Modelos 3D', 'Mapas 2D', 'Drone', 'Alta precisión']],
      ] as const;
      const hidro = [
        ['maquinaria-amarilla', 'Maquinaria Amarilla', 'Suministro y alquiler de maquinaria pesada certificada.'],
        ['equipos-vias', 'Equipos para Vías', 'Apertura, mejoramiento y mantenimiento de vías.'],
        ['transporte-carga', 'Transporte de Carga', 'Logística de carga líquida y seca.'],
        ['izaje-carga', 'Izaje de Carga', 'Izaje especializado con personal certificado.'],
        ['disposicion-residuos', 'Disposición de Residuos', 'Gestión bajo normativa ambiental ISO 14001.'],
        ['lavado-tanques', 'Lavado de Tanques', 'Limpieza de tanques y piscinas industriales.'],
        ['bomba-triplex', 'Bomba Triplex', 'Alta presión, cementación e hidroblasting.'],
        ['camion-vacio', 'Camión de Vacío', 'Succión y transporte de lodos y residuos líquidos.'],
        ['servicios-especializados', 'Servicios Especializados', 'Flashing, cama alta, cargador, minicargador, manlift.'],
        ['topografia-drone', 'Servicio de Topografía', 'Mediciones con Drone y RTK.'],
      ] as const;

      let order = 0;
      for (const [slug, title, summary, tags] of urbanismo) {
        await this.prisma.service.create({
          data: {
            line: ServiceLine.urbanismo,
            slug,
            title,
            summary,
            body: `<p>${summary}</p>`,
            tags: [...tags],
            sortOrder: order++,
            status: PublishStatus.published,
            publishedAt: new Date(),
          },
        });
      }
      order = 0;
      for (const [slug, title, summary] of hidro) {
        await this.prisma.service.create({
          data: {
            line: ServiceLine.hidrocarburos,
            slug,
            title,
            summary,
            body: `<p>${summary}</p>`,
            tags: [],
            sortOrder: order++,
            status: PublishStatus.published,
            publishedAt: new Date(),
          },
        });
      }
    }

    if ((await this.prisma.saleProject.count()) === 0) {
      const projects = [
        {
          slug: 'magno-country-club',
          name: 'Magno Country Club',
          locationCity: 'San Alberto',
          locationDept: 'Cesar',
          summary:
            'Desarrollo urbanístico exclusivo con concepto de club campestre.',
          badges: ['Disponible'],
          tags: ['Zonas verdes', 'Club campestre', 'Residencial', 'Alta valorización'],
          priceFromCop: 60000000,
        },
        {
          slug: 'el-poblado',
          name: 'El Poblado',
          locationCity: 'San Alberto',
          locationDept: 'Cesar',
          summary:
            'Desarrollo residencial y comercial con infraestructura completa.',
          badges: ['Disponible'],
          tags: ['Residencial', 'Comercial', 'Acceso vial', 'Servicios completos'],
          priceFromCop: 38000000,
        },
        {
          slug: 'industrial-park',
          name: 'Industrial Park',
          locationCity: 'San Alberto',
          locationDept: 'Cesar',
          summary:
            'Zona industrial para bodegas, plantas y logística.',
          badges: ['New'],
          tags: ['Uso industrial', 'Bodegas', 'Logística', 'Infraestructura'],
          priceFromCop: 58000000,
        },
        {
          slug: 'time-country-club',
          name: 'Time Country Club',
          locationCity: 'Cartagena',
          locationDept: 'Bolívar',
          summary:
            'Proyecto premium con concepto de club privado en Cartagena.',
          badges: ['New'],
          tags: ['Exclusivo', 'Caribe', 'Club privado', 'Alta valorización'],
          priceFromCop: 54000000,
        },
      ];
      for (const p of projects) {
        await this.prisma.saleProject.create({
          data: {
            ...p,
            body: `<p>${p.summary}</p>`,
            status: PublishStatus.published,
            publishedAt: new Date(),
          },
        });
      }
    }

    if ((await this.prisma.news.count()) === 0) {
      await this.prisma.news.create({
        data: {
          slug: 'bienvenida-justtime',
          title: 'JustTime impulsa el desarrollo del Caribe',
          excerpt:
            'Presentamos nuestra plataforma digital para urbanismo, obras e hidrocarburos.',
          body: '<p>Con capacidad técnica completa acompañamos proyectos urbanos y sub-urbanos en la región.</p>',
          status: PublishStatus.published,
          publishedAt: new Date(),
        },
      });
    }

    if ((await this.prisma.pill.count()) === 0) {
      await this.prisma.pill.createMany({
        data: [
          {
            slug: 'que-es-fotogrametria',
            title: '¿Qué es la fotogrametría?',
            summary: 'Medición y reconstrucción 2D/3D a partir de fotografías.',
            body: '<p>Aplicamos esta tecnología con drone para levantamientos de alta precisión.</p>',
            category: 'Urbanismo',
            status: PublishStatus.published,
            publishedAt: new Date(),
          },
          {
            slug: 'maquinaria-propia',
            title: 'Flota de maquinaria propia',
            summary: 'Mayor eficiencia y control de costos en obra.',
            body: '<p>Contamos con maquinaria amarilla para cada etapa del proyecto.</p>',
            category: 'Obras',
            status: PublishStatus.published,
            publishedAt: new Date(),
          },
        ],
      });
    }
  }
}
