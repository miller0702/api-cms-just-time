import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from './object-storage.service';

@Injectable()
export class MediaService {
  private readonly uploadDir = join(process.cwd(), 'uploads');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  listFolders(parentId?: string | null) {
    return this.prisma.mediaFolder.findMany({
      where: { parentId: parentId || null },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { assets: true, children: true } },
      },
    });
  }

  listAllFolders() {
    return this.prisma.mediaFolder.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { assets: true, children: true } } },
    });
  }

  async createFolder(name: string, parentId?: string | null) {
    const trimmed = name?.trim();
    if (!trimmed) throw new BadRequestException('Nombre de carpeta requerido');
    if (parentId) {
      const parent = await this.prisma.mediaFolder.findUnique({
        where: { id: parentId },
      });
      if (!parent) throw new NotFoundException('Carpeta padre no encontrada');
    }
    return this.prisma.mediaFolder.create({
      data: { name: trimmed, parentId: parentId || null },
    });
  }

  async findOrCreateFolder(name: string, parentId?: string | null) {
    const trimmed = name?.trim();
    if (!trimmed) throw new BadRequestException('Nombre de carpeta requerido');
    const existing = await this.prisma.mediaFolder.findFirst({
      where: { name: trimmed, parentId: parentId || null },
    });
    if (existing) return existing;
    return this.createFolder(trimmed, parentId);
  }

  async ensurePath(segments: string[]) {
    const parts = (segments || [])
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    if (parts.length === 0) {
      throw new BadRequestException('Ruta de carpetas requerida');
    }
    let parentId: string | null = null;
    let leaf = null as Awaited<ReturnType<typeof this.createFolder>> | null;
    for (const part of parts) {
      leaf = await this.findOrCreateFolder(part, parentId);
      parentId = leaf.id;
    }
    return leaf!;
  }

  recentFolders(limit = 12) {
    return this.prisma.mediaFolder.findMany({
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 40),
      include: { _count: { select: { assets: true, children: true } } },
    });
  }

  async renameFolder(id: string, name: string) {
    await this.folderById(id);
    const trimmed = name?.trim();
    if (!trimmed) throw new BadRequestException('Nombre de carpeta requerido');
    return this.prisma.mediaFolder.update({
      where: { id },
      data: { name: trimmed },
    });
  }

  async removeFolder(id: string) {
    await this.folderById(id);
    await this.prisma.mediaFolder.delete({ where: { id } });
    return { ok: true };
  }

  async folderById(id: string) {
    const folder = await this.prisma.mediaFolder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException('Carpeta no encontrada');
    return folder;
  }

  list(
    folderId?: string | null,
    kind?: 'image' | 'video' | 'audio' | 'document' | 'all',
  ) {
    const where: {
      folderId?: string | null;
      OR?: Array<Record<string, unknown>>;
      mimeType?: { startsWith: string };
    } = {};
    if (folderId !== undefined) {
      where.folderId = folderId || null;
    }
    if (kind === 'image') where.mimeType = { startsWith: 'image/' };
    else if (kind === 'video') where.mimeType = { startsWith: 'video/' };
    else if (kind === 'audio') where.mimeType = { startsWith: 'audio/' };
    else if (kind === 'document') {
      where.OR = [
        { mimeType: { startsWith: 'application/' } },
        { mimeType: { startsWith: 'text/' } },
        { mimeType: { equals: 'application/pdf' } },
      ];
    }
    return this.prisma.mediaAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async byId(id: string) {
    const item = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Media no encontrado');
    return item;
  }

  async saveFile(
    file?: Express.Multer.File,
    alt?: string,
    folderId?: string | null,
    displayName?: string,
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    if (folderId) await this.folderById(folderId);

    const original = file.originalname || file.filename || 'file';
    const ext = extname(original) || (file.filename ? extname(file.filename) : '');
    const objectId = randomUUID();
    const objectKey = `cms/media/${objectId}${ext}`;

    const uploaded = await this.storage.uploadMulterFile(file, objectKey);
    const url = uploaded.url;

    const preferred = displayName?.trim();
    const filename =
      preferred && preferred.length > 0
        ? preferred.includes('.')
          ? preferred
          : `${preferred}${ext}`
        : original;

    return this.prisma.mediaAsset.create({
      data: {
        filename,
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: file.size,
        url,
        alt: alt || preferred || null,
        folderId: folderId || null,
      },
    });
  }

  async moveAsset(id: string, folderId: string | null) {
    await this.byId(id);
    if (folderId) await this.folderById(folderId);
    return this.prisma.mediaAsset.update({
      where: { id },
      data: { folderId },
    });
  }

  async remove(id: string) {
    const item = await this.byId(id);
    await this.storage.deleteByUrl(item.url);
    await this.prisma.mediaAsset.delete({ where: { id } });
    return { ok: true };
  }
}
