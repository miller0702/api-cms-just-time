import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPageDto } from './dto/upsert-page.dto';

@Injectable()
export class PagesService {
  constructor(private readonly prisma: PrismaService) {}

  listAdmin() {
    return this.prisma.page.findMany({
      include: { blocks: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async bySlug(slug: string, admin = false) {
    const page = await this.prisma.page.findUnique({
      where: { slug },
      include: { blocks: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!page || (!admin && page.status !== PublishStatus.published)) {
      throw new NotFoundException('Página no encontrada');
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
    return this.prisma.page.create({
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
  }

  async update(id: string, dto: UpsertPageDto) {
    const current = await this.byId(id);
    await this.prisma.pageBlock.deleteMany({ where: { pageId: id } });
    return this.prisma.page.update({
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
  }

  async remove(id: string) {
    await this.byId(id);
    await this.prisma.page.delete({ where: { id } });
    return { ok: true };
  }
}
