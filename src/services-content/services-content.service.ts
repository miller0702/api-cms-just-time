import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PublishStatus, ServiceLine } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertServiceDto } from './dto/upsert-service.dto';

function toGalleryJson(
  gallery: UpsertServiceDto['gallery'],
): Prisma.InputJsonValue {
  return (gallery ?? []) as unknown as Prisma.InputJsonValue;
}

const PUBLIC_LIST_TTL_MS = 30_000;

const publicListSelect = {
  id: true,
  line: true,
  slug: true,
  title: true,
  summary: true,
  tags: true,
  sortOrder: true,
  status: true,
  mediaId: true,
  publishedAt: true,
  media: { select: { id: true, url: true, alt: true } },
} as const;

@Injectable()
export class ServicesContentService {
  private readonly publicListCache = new Map<
    string,
    { at: number; items: unknown }
  >();

  constructor(private readonly prisma: PrismaService) {}

  private invalidatePublicList() {
    this.publicListCache.clear();
  }

  async listPublic(line?: ServiceLine) {
    const cacheKey = line ?? 'all';
    const hit = this.publicListCache.get(cacheKey);
    if (hit && Date.now() - hit.at < PUBLIC_LIST_TTL_MS) {
      return hit.items;
    }

    const items = await this.prisma.service.findMany({
      where: {
        status: PublishStatus.published,
        ...(line ? { line } : {}),
      },
      select: publicListSelect,
      orderBy: { sortOrder: 'asc' },
    });
    this.publicListCache.set(cacheKey, { at: Date.now(), items });
    return items;
  }

  listAdmin() {
    return this.prisma.service.findMany({
      orderBy: [{ line: 'asc' }, { sortOrder: 'asc' }],
      select: {
        id: true,
        line: true,
        slug: true,
        title: true,
        summary: true,
        tags: true,
        sortOrder: true,
        status: true,
        mediaId: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        media: { select: { id: true, url: true, alt: true } },
      },
    });
  }

  async setStatus(id: string, status: PublishStatus) {
    const current = await this.byId(id);
    const updated = await this.prisma.service.update({
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
    this.invalidatePublicList();
    return updated;
  }

  async bySlug(slug: string) {
    const item = await this.prisma.service.findUnique({
      where: { slug },
      include: { media: true },
    });
    if (!item || item.status !== PublishStatus.published) {
      throw new NotFoundException('Servicio no encontrado');
    }
    return item;
  }

  async byId(id: string) {
    const item = await this.prisma.service.findUnique({
      where: { id },
      include: { media: true },
    });
    if (!item) throw new NotFoundException('Servicio no encontrado');
    return item;
  }

  async create(dto: UpsertServiceDto) {
    const created = await this.prisma.service.create({
      data: {
        line: dto.line,
        slug: dto.slug,
        title: dto.title,
        summary: dto.summary,
        body: dto.body,
        tags: dto.tags,
        sortOrder: dto.sortOrder,
        status: dto.status,
        mediaId: dto.mediaId || null,
        gallery: toGalleryJson(dto.gallery),
        publishedAt:
          dto.status === PublishStatus.published ? new Date() : null,
      },
      include: { media: true },
    });
    this.invalidatePublicList();
    return created;
  }

  async update(id: string, dto: UpsertServiceDto) {
    const current = await this.byId(id);
    const updated = await this.prisma.service.update({
      where: { id },
      data: {
        line: dto.line,
        slug: dto.slug,
        title: dto.title,
        summary: dto.summary,
        body: dto.body,
        tags: dto.tags,
        sortOrder: dto.sortOrder,
        status: dto.status,
        mediaId: dto.mediaId || null,
        gallery: toGalleryJson(dto.gallery),
        publishedAt:
          dto.status === PublishStatus.published
            ? (current.publishedAt ?? new Date())
            : current.publishedAt,
      },
      include: { media: true },
    });
    this.invalidatePublicList();
    return updated;
  }

  async remove(id: string) {
    await this.byId(id);
    await this.prisma.service.delete({ where: { id } });
    this.invalidatePublicList();
    return { ok: true };
  }
}
