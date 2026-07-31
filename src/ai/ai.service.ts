/* AI Service - Updated */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  ContentType,
  ContentContext,
  GenerateContentDto,
} from './dto/generate-content.dto';
import { ChatAgentDto } from './dto/chat-agent.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
      this.logger.log('OpenAI client inicializado correctamente');
    } else {
      this.openai = null;
      this.logger.warn(
        'OPENAI_API_KEY no configurada - AI service deshabilitado',
      );
    }
  }

  async generateContent(
    dto: GenerateContentDto,
  ): Promise<{ content: string; tokensUsed: number }> {
    if (!this.openai) {
      throw new BadRequestException(
        'El servicio de IA no está configurado. Falta OPENAI_API_KEY.',
      );
    }

    const systemPrompt = this.buildSystemPrompt(
      dto.type,
      dto.context ?? ContentContext.GENERAL,
      dto.tone,
    );
    const userPrompt = this.buildUserPrompt(dto);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: this.getTemperature(dto.type),
        max_tokens: this.getMaxTokens(dto.type),
      });

      const content = response.choices[0]?.message?.content?.trim() ?? '';
      const tokensUsed = response.usage?.total_tokens ?? 0;

      this.logger.log(`Contenido generado: ${dto.type} (${tokensUsed} tokens)`);

      return { content, tokensUsed };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error generando contenido: ${message}`);
      throw new BadRequestException(`Error al generar contenido: ${message}`);
    }
  }

  isConfigured(): boolean {
    return this.openai !== null;
  }

  private buildSystemPrompt(
    type: ContentType,
    context: ContentContext,
    tone?: string,
  ): string {
    const companyContext = `
Eres un redactor de contenido profesional para Just Time S.A.S, una empresa colombiana especializada en:
- Urbanismo: obras civiles, topografía, diseño arquitectónico, desarrollo de vías, fotogrametría
- Hidrocarburos: maquinaria amarilla, transporte de carga, izaje, disposición de residuos, servicios especializados
- Venta de lotes: proyectos inmobiliarios como Magno Country Club, El Poblado, Industrial Park, Time Country Club

La empresa opera principalmente en el Caribe colombiano, especialmente en San Alberto (Cesar) y Cartagena (Bolívar).
`;

    const toneInstruction = tone
      ? `Usa un tono ${tone}.`
      : 'Usa un tono profesional pero cercano, típico de empresas colombianas del sector construcción.';

    const contextMap: Record<ContentContext, string> = {
      [ContentContext.NEWS]:
        'Estás escribiendo contenido para una noticia corporativa.',
      [ContentContext.SERVICE]:
        'Estás describiendo un servicio técnico de la empresa.',
      [ContentContext.PROJECT]:
        'Estás describiendo un proyecto inmobiliario de venta de lotes.',
      [ContentContext.PAGE]:
        'Estás escribiendo contenido para una página del sitio web.',
      [ContentContext.PILL]:
        'Estás escribiendo una "píldora informativa" - contenido breve y educativo.',
      [ContentContext.GENERAL]:
        'Estás escribiendo contenido general para la empresa.',
    };

    const typeInstructions: Record<ContentType, string> = {
      [ContentType.TITLE]: `
Genera UN título atractivo y conciso (máximo 80 caracteres).
NO uses comillas ni puntuación final.
El título debe ser llamativo pero profesional.
`,
      [ContentType.SUMMARY]: `
Genera UN resumen conciso (máximo 160 caracteres).
Debe capturar la esencia del contenido de forma atractiva.
Ideal para preview cards o extractos.
`,
      [ContentType.BODY]: `
Genera contenido HTML bien estructurado.
Usa etiquetas como <p>, <h2>, <h3>, <ul>, <li>, <strong>, <em> según corresponda.
NO uses <h1> (el título va aparte).
El contenido debe ser informativo, bien organizado y de fácil lectura.
Incluye entre 2-4 párrafos según la complejidad del tema.
`,
      [ContentType.SEO_DESCRIPTION]: `
Genera UNA meta descripción SEO (máximo 155 caracteres).
Debe incluir palabras clave relevantes de forma natural.
Debe incitar al clic sin ser clickbait.
`,
      [ContentType.IMPROVE]: `
Mejora el texto proporcionado manteniendo el mensaje original.
Corrige errores ortográficos y gramaticales.
Mejora la claridad y fluidez.
Mantén el formato original (si es HTML, devuelve HTML).
`,
      [ContentType.TAGS]: `
Genera una lista de 4-6 tags/etiquetas relevantes separadas por coma.
Cada tag debe ser corta (1-3 palabras).
Las tags deben ser relevantes para SEO y categorización.
Ejemplo: "Maquinaria pesada, Transporte, Logística, Sector energético"
NO uses hashtags (#), solo las palabras.
`,
      [ContentType.HEADLINE]: `
Genera UN titular impactante y corto (máximo 60 caracteres).
Debe ser potente, directo y memorable.
Ideal para headers de secciones hero o banners.
NO uses puntuación final.
`,
      [ContentType.SLUG]: `
Genera UN slug URL-friendly basado en el contenido proporcionado.
El slug debe:
- Estar completamente en minúsculas
- Usar guiones (-) en lugar de espacios
- NO contener caracteres especiales, tildes ni ñ (reemplaza ñ por n)
- Ser conciso pero descriptivo (3-6 palabras máximo)
- Ser relevante para SEO
Ejemplo: "maquinaria-amarilla-sector-energetico"
Responde SOLO con el slug, sin explicaciones.
`,
    };

    return `${companyContext}

${contextMap[context]}

${typeInstructions[type]}

${toneInstruction}

IMPORTANTE:
- Escribe en español colombiano (evita regionalismos de otros países).
- NO inventes datos específicos como precios, fechas o cifras a menos que se proporcionen.
- Responde ÚNICAMENTE con el contenido solicitado, sin explicaciones adicionales.
`;
  }

  private buildUserPrompt(dto: GenerateContentDto): string {
    if (dto.type === ContentType.IMPROVE && dto.existingContent) {
      return `Mejora el siguiente texto:\n\n${dto.existingContent}\n\nInstrucciones adicionales: ${dto.prompt}`;
    }

    if (dto.existingContent) {
      return `Basándote en este contenido existente:\n\n${dto.existingContent}\n\n${dto.prompt}`;
    }

    return dto.prompt;
  }

  private getTemperature(type: ContentType): number {
    switch (type) {
      case ContentType.TITLE:
      case ContentType.HEADLINE:
        return 0.8;
      case ContentType.BODY:
        return 0.7;
      case ContentType.SUMMARY:
      case ContentType.SEO_DESCRIPTION:
      case ContentType.TAGS:
        return 0.6;
      case ContentType.IMPROVE:
        return 0.4;
      case ContentType.SLUG:
        return 0.3;
      default:
        return 0.7;
    }
  }

  private getMaxTokens(type: ContentType): number {
    switch (type) {
      case ContentType.TITLE:
      case ContentType.HEADLINE:
      case ContentType.SLUG:
        return 50;
      case ContentType.SUMMARY:
      case ContentType.SEO_DESCRIPTION:
      case ContentType.TAGS:
        return 100;
      case ContentType.BODY:
        return 1000;
      case ContentType.IMPROVE:
        return 1500;
      default:
        return 500;
    }
  }

  /**
   * Chat del agente público - responde preguntas sobre la empresa
   */
  async chatAgent(
    dto: ChatAgentDto,
  ): Promise<{ text: string; links?: Array<{ label: string; href: string }> }> {
    if (!this.openai) {
      return {
        text: 'Puedo ayudarte con urbanismo, hidrocarburos, proyectos de lotes o una cotización. Escribe "asesor" para hablar con el equipo.',
        links: [
          { label: 'Urbanismo', href: '/urbanismo' },
          { label: 'Hidrocarburos', href: '/hidrocarburos' },
          { label: 'Proyectos', href: '/proyectos' },
        ],
      };
    }

    try {
      // Obtener contexto de la empresa desde la base de datos
      const [services, projects, settings] = await Promise.all([
        this.prisma.service.findMany({
          where: { status: 'published' },
          select: { title: true, summary: true, line: true, slug: true },
          take: 20,
        }),
        this.prisma.saleProject.findMany({
          where: { status: 'published' },
          select: {
            name: true,
            summary: true,
            slug: true,
            locationCity: true,
            priceFromCop: true,
          },
          take: 10,
        }),
        this.prisma.siteSetting.findMany({
          where: { key: { in: ['brand', 'contact'] } },
        }),
      ]);

      const brandSetting = settings.find((s) => s.key === 'brand');
      const contactSetting = settings.find((s) => s.key === 'contact');
      const brand = brandSetting?.value as Record<string, string> | undefined;
      const contact = contactSetting?.value as
        Record<string, string> | undefined;

      const servicesUrbanismo = services.filter((s) => s.line === 'urbanismo');
      const servicesHidro = services.filter((s) => s.line === 'hidrocarburos');

      const contextPrompt = `
Eres un asistente experto en construcción, ingeniería civil y sector energético que trabaja para ${brand?.name || 'Just Time S.A.S.'}.

=== REGLA PRINCIPAL (OBLIGATORIA) ===
Cuando el usuario haga una PREGUNTA DE DEFINICIÓN como:
- "¿Qué es topografía?"
- "¿Qué es fotogrametría?"
- "¿Para qué sirve el izaje?"
- "¿Cómo funciona una excavadora?"

DEBES responder así:
1. PRIMERO: Explica QUÉ ES el término (definición clara en 1-2 oraciones)
2. SEGUNDO: Opcionalmente menciona que la empresa ofrece ese servicio

EJEMPLO CORRECTO:
Pregunta: "¿Qué es topografía?"
Respuesta: "La topografía es la ciencia que mide y representa las características del terreno: elevaciones, pendientes y coordenadas. Se usan equipos como estación total, GPS y drones. En Just Time ofrecemos este servicio para proyectos de urbanismo."

EJEMPLO INCORRECTO (PROHIBIDO):
Pregunta: "¿Qué es topografía?"
Respuesta: "En urbanismo cubrimos topografía..." ← ESTO ESTÁ MAL porque no explica qué es

=== CONOCIMIENTO TÉCNICO ===
- Topografía: ciencia que mide y representa terrenos usando estación total, GPS, drones
- Fotogrametría: técnica para crear mapas y modelos 3D a partir de fotografías aéreas
- Izaje: operación de levantar y mover cargas pesadas con grúas
- Maquinaria amarilla: equipos de construcción como excavadoras, bulldozers, retroexcavadoras
- Movimiento de tierras: excavación, relleno y nivelación de terrenos
- Obras civiles: construcción de infraestructura como cimentaciones, estructuras, vías

=== INFORMACIÓN DE LA EMPRESA ===
- Nombre: ${brand?.name || 'Just Time S.A.S.'}
- Ubicación: ${contact?.city || 'San Alberto, Cesar — Colombia'}
- WhatsApp: ${contact?.whatsapp || '573176073815'}
- Email: ${contact?.email || 'administracion@justtimesas.com'}

SERVICIOS:
1. Urbanismo: ${servicesUrbanismo.map((s) => s.title).join(', ') || 'obras civiles, topografía, diseño arquitectónico'}
2. Hidrocarburos: ${servicesHidro.map((s) => s.title).join(', ') || 'maquinaria amarilla, transporte, izaje'}
3. Proyectos inmobiliarios: ${projects.map((p) => p.name).join(', ') || 'Magno Country Club, El Poblado'}

=== OTRAS REGLAS ===
- Responde en español colombiano, profesional pero cercano
- Sé conciso (2-3 oraciones)
- Para cotizaciones: invita al formulario de contacto
- NUNCA inventes precios de servicios
`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: contextPrompt },
          { role: 'user', content: dto.message },
        ],
        temperature: 0.7,
        max_tokens: 200,
      });

      const text =
        response.choices[0]?.message?.content?.trim() ||
        'Puedo ayudarte con urbanismo, hidrocarburos o proyectos. ¿Qué te gustaría saber?';

      // Detectar links relevantes basados en la respuesta y la pregunta
      const links = this.detectRelevantLinks(dto.message, text, dto.pathname);

      this.logger.log(
        `Chat agent: "${dto.message.slice(0, 50)}..." → ${response.usage?.total_tokens} tokens`,
      );

      return { text, links };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error en chat agent: ${message}`);
      return {
        text: 'Puedo ayudarte con urbanismo, hidrocarburos, proyectos de lotes o una cotización.',
        links: [
          { label: 'Urbanismo', href: '/urbanismo' },
          { label: 'Hidrocarburos', href: '/hidrocarburos' },
          { label: 'Proyectos', href: '/proyectos' },
        ],
      };
    }
  }

  private detectRelevantLinks(
    question: string,
    answer: string,
    pathname?: string,
  ): Array<{ label: string; href: string }> {
    const combined = `${question} ${answer}`.toLowerCase();
    const links: Array<{ label: string; href: string }> = [];

    // Detectar menciones de líneas de negocio - urbanismo
    if (
      /urbanismo|obra civil|topograf|arquitect|fotogrametr|dron|levantamiento|geodesia|diseño|vía|ciment/i.test(
        combined,
      )
    ) {
      links.push({ label: 'Ver urbanismo', href: '/urbanismo' });
    }

    // Detectar menciones de líneas de negocio - hidrocarburos
    if (
      /hidrocarburo|transporte|maquinaria|izaje|energetic|excav|retroexcav|bulldozer|grua|carga|petrol|pozo|tracto|cama baja/i.test(
        combined,
      )
    ) {
      links.push({ label: 'Ver hidrocarburos', href: '/hidrocarburos' });
    }

    // Detectar menciones de proyectos
    if (
      /proyecto|lote|magno|poblado|country|industrial|parcel|urbanizaci|terreno|inmobi/i.test(
        combined,
      )
    ) {
      links.push({ label: 'Ver proyectos', href: '/proyectos' });
    }

    // Detectar intención de cotizar
    if (
      /cotiz|precio|presupuesto|contacto|formulario|cuánto|cuanto|cuesta|valor/i.test(
        combined,
      )
    ) {
      let line = '';
      if (pathname?.startsWith('/hidrocarburos')) line = 'hidrocarburos';
      else if (pathname?.startsWith('/urbanismo')) line = 'urbanismo';
      else if (pathname?.startsWith('/proyectos')) line = 'proyectos';
      links.push({
        label: 'Ir a contacto',
        href: line ? `/contacto?line=${line}` : '/contacto',
      });
    }

    // Detectar mención de asesor
    if (/asesor|whatsapp|hablar|llamar/i.test(combined)) {
      links.push({ label: 'Hablar con un asesor', href: '__whatsapp__' });
    }

    // Limitar a 3 links máximo
    return links.slice(0, 3);
  }

  /**
   * Asistente de ayuda para el panel admin
   */
  async adminHelp(
    message: string,
    currentPage?: string,
  ): Promise<{ text: string }> {
    if (!this.openai) {
      return {
        text: 'El asistente de ayuda no está disponible. Contacta al administrador del sistema.',
      };
    }

    const pageContextMap: Record<string, string> = {
      dashboard:
        'El Dashboard muestra estadísticas generales del sitio: vistas, contenido publicado, leads recientes.',
      analytics:
        'Analytics muestra métricas detalladas: visitas por página, IPs, dispositivos, navegadores y eventos.',
      noticias:
        'Aquí gestionas noticias. Puedes crear, editar, publicar/despublicar y eliminar noticias. Cada noticia tiene título, slug, extracto, cuerpo (HTML), imagen de portada y estado.',
      pildoras:
        'Las píldoras son contenidos breves tipo tips/consejos. Similar a noticias pero más cortas y categorizadas.',
      servicios:
        'Aquí gestionas servicios de la empresa. Cada servicio pertenece a una línea (urbanismo/hidrocarburos) y tiene título, slug, resumen, cuerpo, tags y galería.',
      proyectos:
        'Proyectos de venta de lotes inmobiliarios. Incluyen ubicación, precios, badges, tags y galería de imágenes.',
      paginas:
        'Páginas CMS con editor de bloques. Puedes crear páginas personalizadas con diferentes tipos de bloques: hero, texto, grids, etc.',
      media:
        'Biblioteca de medios. Sube imágenes, videos, PDFs. Organiza en carpetas. Recomendaciones de tamaño según uso.',
      portada:
        'Configura el hero del home: textos, CTAs, imágenes/videos de fondo, animaciones por servicio.',
      leads:
        'Cotizaciones/leads recibidos desde el formulario de contacto. Puedes cambiar su estado (nuevo, en progreso, cerrado).',
      usuarios:
        'Gestión de usuarios administradores. Crear, editar, asignar roles.',
      roles:
        'Gestión de roles y permisos. Define qué puede hacer cada tipo de usuario.',
      ajustes:
        'Personalización del sitio: marca, logos, colores, menú, footer, redes sociales, textos legales, modo del sitio.',
    };

    const currentPageContext = currentPage
      ? pageContextMap[currentPage] ||
        'Página general del panel de administración.'
      : 'Panel de administración general.';

    const systemPrompt = `
Eres el asistente de ayuda del panel de administración del CMS de Just Time.

TU ROL:
- Ayudar a los usuarios a entender cómo usar el panel de administración
- Explicar funcionalidades de forma clara y concisa
- Dar instrucciones paso a paso cuando sea necesario
- Resolver dudas sobre el CMS

CONTEXTO ACTUAL:
El usuario está en: ${currentPage || 'el panel de administración'}
${currentPageContext}

SECCIONES DEL CMS:
1. **Dashboard**: Vista general con estadísticas
2. **Analytics**: Métricas de visitas, IPs, dispositivos
3. **Contenido**: Noticias y Píldoras (tips técnicos)
4. **Catálogo**: Servicios (urbanismo/hidrocarburos), Proyectos (lotes), Páginas CMS
5. **Media**: Biblioteca de imágenes y archivos
6. **Portada**: Configuración del hero del home
7. **Cotizaciones**: Leads/solicitudes de contacto
8. **Usuarios y Roles**: Gestión de accesos
9. **Personalizar**: Marca, colores, menús, footer, legal

FUNCIONALIDADES ESPECIALES:
- **Generación con IA**: En los formularios de contenido hay botones de IA (✨) para generar títulos, resúmenes, cuerpos, SEO, tags y slugs automáticamente.
- **"Generar todo"**: Botón en la parte superior de formularios para generar múltiples campos de una vez.
- **Estados de publicación**: "Borrador" (contenido no visible en el sitio) y "Publicado" (visible para todos). El selector está en cada formulario de contenido.
- **Slugs**: URLs amigables que se generan automáticamente del título pero se pueden editar.

VOCABULARIO OBLIGATORIO (usa SIEMPRE estos términos en español):
- Estado "Borrador" (NO digas "draft")
- Estado "Publicado" (NO digas "published")  
- "Guardar" (NO digas "save")
- "Crear" o "Nuevo" (NO digas "create" o "new")
- "Editar" (NO digas "edit")
- "Eliminar" (NO digas "delete")
- "Contenido" para referirte a Noticias/Píldoras
- "Catálogo" para referirte a Servicios/Proyectos/Páginas

REGLAS:
- Responde SIEMPRE en español colombiano
- Usa los términos del vocabulario obligatorio
- Sé claro y conciso (2-4 oraciones)
- Si preguntan cómo hacer algo, da pasos concretos numerados
- Si no sabes algo específico, sugiere dónde buscar o a quién preguntar
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      const text =
        response.choices[0]?.message?.content?.trim() ||
        'No pude procesar tu pregunta. Intenta reformularla.';

      this.logger.log(
        `Admin help: "${message.slice(0, 50)}..." → ${response.usage?.total_tokens} tokens`,
      );

      return { text };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error en admin help: ${msg}`);
      return {
        text: 'Hubo un error al procesar tu pregunta. Intenta de nuevo.',
      };
    }
  }
}
