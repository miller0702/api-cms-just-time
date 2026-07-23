import { Injectable, NotFoundException } from '@nestjs/common';
import { PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertProjectDto } from './dto/upsert-project.dto';

const projectInclude = {
  coverMedia: true,
  logoMedia: true,
} as const;

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

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
        status: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        coverMedia: { select: { id: true, url: true, alt: true } },
        logoMedia: { select: { id: true, url: true, alt: true } },
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
    return item;
  }

  async byId(id: string) {
    const item = await this.prisma.saleProject.findUnique({
      where: { id },
      include: projectInclude,
    });
    if (!item) throw new NotFoundException('Proyecto no encontrado');
    return item;
  }

  create(dto: UpsertProjectDto) {
    return this.prisma.saleProject.create({
      data: {
        ...dto,
        erpProjectId: dto.erpProjectId || null,
        coverMediaId: dto.coverMediaId || null,
        logoMediaId: dto.logoMediaId || null,
        publishedAt:
          dto.status === PublishStatus.published ? new Date() : null,
      },
      include: projectInclude,
    });
  }

  async update(id: string, dto: UpsertProjectDto) {
    const current = await this.byId(id);
    return this.prisma.saleProject.update({
      where: { id },
      data: {
        ...dto,
        erpProjectId: dto.erpProjectId || null,
        coverMediaId: dto.coverMediaId || null,
        logoMediaId: dto.logoMediaId || null,
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
