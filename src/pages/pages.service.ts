import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPageDto } from './dto/upsert-page.dto';

type PageWithBlocks = Prisma.PageGetPayload<{
  include: { blocks: true };
}>;

const PUBLIC_PAGE_TTL_MS = 30_000;

@Injectable()
export class PagesService {
  private readonly publicCache = new Map<
    string,
    { at: number; page: PageWithBlocks }
  >();

  constructor(private readonly prisma: PrismaService) {}

  private invalidatePublic(slug?: string) {
    if (slug) this.publicCache.delete(slug);
    else this.publicCache.clear();
  }

  listAdmin() {
    return this.prisma.page.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        seoDescription: true,
        status: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { blocks: true } },
      },
    });
  }

  async setStatus(id: string, status: PublishStatus) {
    const current = await this.prisma.page.findUnique({
      where: { id },
      select: { id: true, slug: true, publishedAt: true },
    });
    if (!current) throw new NotFoundException('Página no encontrada');
    const updated = await this.prisma.page.update({
      where: { id },
      data: {
        status,
        publishedAt:
          status === PublishStatus.published
            ? (current.publishedAt ?? new Date())
            : current.publishedAt,
      },
      select: { id: true, status: true, publishedAt: true, slug: true },
    });
    this.invalidatePublic(current.slug);
    return updated;
  }

  async bySlug(slug: string, admin = false) {
    if (!admin) {
      const hit = this.publicCache.get(slug);
      if (hit && Date.now() - hit.at < PUBLIC_PAGE_TTL_MS) {
        return hit.page;
      }
    }

    const page = await this.prisma.page.findUnique({
      where: { slug },
      include: { blocks: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!page || (!admin && page.status !== PublishStatus.published)) {
      throw new NotFoundException('Página no encontrada');
    }
    if (!admin) {
      this.publicCache.set(slug, { at: Date.now(), page });
    }
    return page;
  }

  async byId(id: string) {
    const page = await this.prisma.page.findUnique({
      where: { id },
      include: { blocks: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!page) throw new NotFoundException('Página no encontrada');
    return page;
  }

  async create(dto: UpsertPageDto) {
    const page = await this.prisma.page.create({
      data: {
        slug: dto.slug,
        title: dto.title,
        seoDescription: dto.seoDescription || null,
        status: dto.status,
        publishedAt:
          dto.status === PublishStatus.published ? new Date() : null,
        blocks: {
          create: dto.blocks.map((b) => ({
            type: b.type,
            sortOrder: b.sortOrder,
            payload: b.payload as Prisma.InputJsonValue,
          })),
        },
      },
      include: { blocks: { orderBy: { sortOrder: 'asc' } } },
    });
    this.invalidatePublic(page.slug);
    return page;
  }

  async update(id: string, dto: UpsertPageDto) {
    const current = await this.prisma.page.findUnique({
      where: { id },
      select: { id: true, slug: true, publishedAt: true },
    });
    if (!current) throw new NotFoundException('Página no encontrada');

    await this.prisma.pageBlock.deleteMany({ where: { pageId: id } });
    const page = await this.prisma.page.update({
      where: { id },
      data: {
        slug: dto.slug,
        title: dto.title,
        seoDescription: dto.seoDescription || null,
        status: dto.status,
        publishedAt:
          dto.status === PublishStatus.published
            ? (current.publishedAt ?? new Date())
            : current.publishedAt,
        blocks: {
          create: dto.blocks.map((b) => ({
            type: b.type,
            sortOrder: b.sortOrder,
            payload: b.payload as Prisma.InputJsonValue,
          })),
        },
      },
      include: { blocks: { orderBy: { sortOrder: 'asc' } } },
    });
    this.invalidatePublic(current.slug);
    if (current.slug !== page.slug) this.invalidatePublic(page.slug);
    return page;
  }

  async remove(id: string) {
    const current = await this.prisma.page.findUnique({
      where: { id },
      select: { id: true, slug: true },
    });
    if (!current) throw new NotFoundException('Página no encontrada');
    await this.prisma.page.delete({ where: { id } });
    this.invalidatePublic(current.slug);
    return { ok: true };
  }
}
