import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PublishStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLotInquiryDto } from './dto/create-lot-inquiry.dto';
import { UpsertProjectDto } from './dto/upsert-project.dto';
import { ErpUrbanismoClient } from './erp-urbanismo.client';
import { isSpamContact, loadSpamBlocklist } from '../leads/spam-blocklist';

/** Ventana para no duplicar el lead cuando el visitante reenvía el formulario. */
const LOT_INQUIRY_DEDUPE_MINUTES = 10;

const projectInclude = {
  coverMedia: true,
  logoMedia: true,
  bannerMedia: true,
} as const;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly erp: ErpUrbanismoClient,
    private readonly notifications: NotificationsService,
  ) {}

  listPublic() {
    return this.prisma.saleProject.findMany({
      where: { status: PublishStatus.published },
      include: projectInclude,
      orderBy: { publishedAt: 'desc' },
    });
  }

  listAdmin() {
    return this.prisma.saleProject.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        slug: true,
        name: true,
        locationCity: true,
        locationDept: true,
        summary: true,
        badges: true,
        tags: true,
        priceFromCop: true,
        erpProjectId: true,
        coverMediaId: true,
        logoMediaId: true,
        bannerMediaId: true,
        gallery: true,
        brochureUrl: true,
        status: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        coverMedia: { select: { id: true, url: true, alt: true } },
        logoMedia: { select: { id: true, url: true, alt: true } },
        bannerMedia: { select: { id: true, url: true, alt: true } },
      },
    });
  }

  async setStatus(id: string, status: PublishStatus) {
    const current = await this.byId(id);
    return this.prisma.saleProject.update({
      where: { id },
      data: {
        status,
        publishedAt:
          status === PublishStatus.published
            ? (current.publishedAt ?? new Date())
            : current.publishedAt,
      },
      select: { id: true, status: true, publishedAt: true },
    });
  }

  async bySlug(slug: string) {
    const item = await this.prisma.saleProject.findUnique({
      where: { slug },
      include: projectInclude,
    });
    if (!item || item.status !== PublishStatus.published) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return {
      ...item,
      hasErpLink: Boolean(item.erpProjectId),
      erpConfigured: this.erp.configured,
    };
  }

  async byId(id: string) {
    const item = await this.prisma.saleProject.findUnique({
      where: { id },
      include: projectInclude,
    });
    if (!item) throw new NotFoundException('Proyecto no encontrado');
    return item;
  }

  private async resolveErpIdBySlug(slug: string) {
    const item = await this.bySlug(slug);
    if (!item.erpProjectId) {
      throw new BadRequestException(
        'Este proyecto CMS no está vinculado a un proyecto ERP (erpProjectId)',
      );
    }
    return item.erpProjectId;
  }

  async getErpLots(slug: string) {
    const erpId = await this.resolveErpIdBySlug(slug);
    return this.erp.getLots(erpId);
  }

  async getErpMap(slug: string) {
    const erpId = await this.resolveErpIdBySlug(slug);
    const map = await this.erp.getMap(erpId);
    const svgUrl = typeof map.svgUrl === 'string' ? map.svgUrl : null;
    const svgText = svgUrl ? await this.erp.getMapSvgText(svgUrl) : null;
    return { ...map, svgText };
  }

  async createLotInquiry(
    slug: string,
    lotId: string,
    dto: CreateLotInquiryDto,
    idempotencyKey?: string,
  ) {
    if (dto.website?.trim()) {
      return {
        id: 'spam',
        status: 'spam',
        erpSynced: false,
        erpInterest: null,
      };
    }
    if (dto.consentAccepted !== true) {
      throw new BadRequestException(
        'Debes aceptar el tratamiento de datos personales',
      );
    }
    if (!dto.email?.trim() && !dto.phone?.trim()) {
      throw new BadRequestException('Indica un correo o teléfono de contacto');
    }
    const blocklist = await loadSpamBlocklist(this.prisma);
    if (isSpamContact({ email: dto.email, phone: dto.phone }, blocklist).blocked) {
      return {
        id: 'spam',
        status: 'spam',
        erpSynced: false,
        erpInterest: null,
      };
    }
    const erpId = await this.resolveErpIdBySlug(slug);
    const lead = await this.saveLotInquiryLead(slug, lotId, dto);

    let erpInterest: unknown = null;
    try {
      erpInterest = await this.erp.createInterest(
        erpId,
        lotId,
        { ...dto },
        idempotencyKey,
      );
    } catch {
      // El lead ya quedó en el inbox del CMS; urbanismo lo retoma desde ahí.
      erpInterest = null;
    }

    return {
      id: lead.id,
      status: lead.status,
      erpSynced: Boolean(erpInterest),
      erpInterest,
    };
  }

  private async saveLotInquiryLead(
    slug: string,
    lotId: string,
    dto: CreateLotInquiryDto,
  ) {
    const lotCode = dto.lotCode?.trim() || lotId;
    const email = dto.email?.trim() || '';
    const phone = dto.phone?.trim() || null;
    const since = new Date(Date.now() - LOT_INQUIRY_DEDUPE_MINUTES * 60_000);
    const recent = await this.prisma.lead.findFirst({
      where: {
        kind: 'lot_inquiry',
        projectSlug: slug,
        lotCode,
        createdAt: { gte: since },
        ...(email ? { email } : { phone }),
      },
    });
    if (recent) return recent;

    const lead = await this.prisma.lead.create({
      data: {
        name: dto.name.trim(),
        email,
        phone,
        message:
          dto.message?.trim() ||
          `Interés en el lote ${lotCode} del proyecto ${slug}.`,
        source: 'website-lote',
        kind: 'lot_inquiry',
        consent: true,
        subject: `Lote ${lotCode}`,
        projectSlug: slug,
        lotCode,
      },
    });
    void this.notifications.notifyLead(lead);
    return lead;
  }

  create(dto: UpsertProjectDto) {
    return this.prisma.saleProject.create({
      data: {
        slug: dto.slug,
        name: dto.name,
        locationCity: dto.locationCity,
        locationDept: dto.locationDept,
        summary: dto.summary,
        seoTitle: dto.seoTitle || null,
        seoDescription: dto.seoDescription || null,
        seoImageUrl: dto.seoImageUrl || null,
        body: dto.body,
        badges: dto.badges,
        tags: dto.tags,
        priceFromCop: dto.priceFromCop,
        status: dto.status,
        erpProjectId: dto.erpProjectId || null,
        coverMediaId: dto.coverMediaId || null,
        logoMediaId: dto.logoMediaId || null,
        bannerMediaId: dto.bannerMediaId || null,
        gallery: (dto.gallery || []) as Prisma.InputJsonValue,
        brochureUrl: dto.brochureUrl || null,
        publishedAt: dto.status === PublishStatus.published ? new Date() : null,
      },
      include: projectInclude,
    });
  }

  async update(id: string, dto: UpsertProjectDto) {
    const current = await this.byId(id);
    return this.prisma.saleProject.update({
      where: { id },
      data: {
        slug: dto.slug,
        name: dto.name,
        locationCity: dto.locationCity,
        locationDept: dto.locationDept,
        summary: dto.summary,
        seoTitle: dto.seoTitle || null,
        seoDescription: dto.seoDescription || null,
        seoImageUrl: dto.seoImageUrl || null,
        body: dto.body,
        badges: dto.badges,
        tags: dto.tags,
        priceFromCop: dto.priceFromCop,
        status: dto.status,
        erpProjectId: dto.erpProjectId || null,
        coverMediaId: dto.coverMediaId || null,
        logoMediaId: dto.logoMediaId || null,
        bannerMediaId: dto.bannerMediaId || null,
        gallery: (dto.gallery ?? current.gallery) as Prisma.InputJsonValue,
        brochureUrl:
          dto.brochureUrl !== undefined ? dto.brochureUrl : current.brochureUrl,
        publishedAt:
          dto.status === PublishStatus.published
            ? (current.publishedAt ?? new Date())
            : current.publishedAt,
      },
      include: projectInclude,
    });
  }

  async remove(id: string) {
    await this.byId(id);
    await this.prisma.saleProject.delete({ where: { id } });
    return { ok: true };
  }
}
