import { Injectable, NotFoundException } from '@nestjs/common';
import { PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPillDto } from './dto/upsert-pill.dto';

@Injectable()
export class PillsService {
  constructor(private readonly prisma: PrismaService) {}

  listPublic() {
    return this.prisma.pill.findMany({
      where: { status: PublishStatus.published },
      include: { coverMedia: true },
      orderBy: { publishedAt: 'desc' },
    });
  }

  listAdmin() {
    return this.prisma.pill.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        category: true,
        status: true,
        coverMediaId: true,
        publishedAt: true,
        viewCount: true,
        likeCount: true,
        shareCount: true,
        commentCount: true,
        createdAt: true,
        updatedAt: true,
        coverMedia: { select: { id: true, url: true, alt: true } },
      },
    });
  }

  async setStatus(id: string, status: PublishStatus) {
    const current = await this.byId(id);
    return this.prisma.pill.update({
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

  async bySlug(slug: string, admin = false) {
    const item = await this.prisma.pill.findUnique({
      where: { slug },
      include: { coverMedia: true },
    });
    if (!item || (!admin && item.status !== PublishStatus.published)) {
      throw new NotFoundException('Píldora no encontrada');
    }
    return item;
  }

  async byId(id: string) {
    const item = await this.prisma.pill.findUnique({
      where: { id },
      include: { coverMedia: true },
    });
    if (!item) throw new NotFoundException('Píldora no encontrada');
    return item;
  }

  create(dto: UpsertPillDto) {
    return this.prisma.pill.create({
      data: {
        ...dto,
        category: dto.category || null,
        coverMediaId: dto.coverMediaId || null,
        publishedAt:
          dto.status === PublishStatus.published ? new Date() : null,
      },
      include: { coverMedia: true },
    });
  }

  async update(id: string, dto: UpsertPillDto) {
    const current = await this.byId(id);
    return this.prisma.pill.update({
      where: { id },
      data: {
        ...dto,
        category: dto.category || null,
        coverMediaId: dto.coverMediaId || null,
        publishedAt:
          dto.status === PublishStatus.published
            ? (current.publishedAt ?? new Date())
            : current.publishedAt,
      },
      include: { coverMedia: true },
    });
  }

  async remove(id: string) {
    await this.byId(id);
    await this.prisma.pill.delete({ where: { id } });
    return { ok: true };
  }
}
