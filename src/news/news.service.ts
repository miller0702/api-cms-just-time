import { Injectable, NotFoundException } from '@nestjs/common';
import { PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertNewsDto } from './dto/upsert-news.dto';

@Injectable()
export class NewsService {
  constructor(private readonly prisma: PrismaService) {}

  listPublic() {
    return this.prisma.news.findMany({
      where: { status: PublishStatus.published },
      include: { coverMedia: true },
      orderBy: { publishedAt: 'desc' },
    });
  }

  listAdmin() {
    return this.prisma.news.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
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
    return this.prisma.news.update({
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
    const item = await this.prisma.news.findUnique({
      where: { slug },
      include: { coverMedia: true },
    });
    if (!item || (!admin && item.status !== PublishStatus.published)) {
      throw new NotFoundException('Noticia no encontrada');
    }
    return item;
  }

  async byId(id: string) {
    const item = await this.prisma.news.findUnique({
      where: { id },
      include: { coverMedia: true },
    });
    if (!item) throw new NotFoundException('Noticia no encontrada');
    return item;
  }

  create(dto: UpsertNewsDto) {
    return this.prisma.news.create({
      data: {
        ...dto,
        coverMediaId: dto.coverMediaId || null,
        publishedAt:
          dto.status === PublishStatus.published ? new Date() : null,
      },
      include: { coverMedia: true },
    });
  }

  async update(id: string, dto: UpsertNewsDto) {
    const current = await this.byId(id);
    return this.prisma.news.update({
      where: { id },
      data: {
        ...dto,
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
    await this.prisma.news.delete({ where: { id } });
    return { ok: true };
  }
}
