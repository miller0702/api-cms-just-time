import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { basename, extname, join } from 'path';
import { randomUUID } from 'crypto';
import AdmZip from 'adm-zip';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from './object-storage.service';
import {
  FONT_MIME,
  guessFamilyName,
  selectBestFaces,
} from './font-pack';

export type FontFaceOut = {
  id: string;
  url: string;
  filename: string;
  weight: number;
  style: 'normal' | 'italic';
  mimeType: string;
  variable?: boolean;
};

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
    kind?: 'image' | 'video' | 'audio' | 'document' | 'font' | 'all',
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
    else if (kind === 'font') {
      where.OR = [
        { mimeType: { startsWith: 'font/' } },
        { mimeType: { equals: 'application/font-woff' } },
        { mimeType: { equals: 'application/font-woff2' } },
        { mimeType: { equals: 'application/x-font-ttf' } },
        { mimeType: { equals: 'application/x-font-otf' } },
        { mimeType: { equals: 'application/octet-stream' } },
        { filename: { endsWith: '.woff2' } },
        { filename: { endsWith: '.woff' } },
        { filename: { endsWith: '.ttf' } },
        { filename: { endsWith: '.otf' } },
      ];
    } else if (kind === 'document') {
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
    let ext =
      extname(original) || (file.filename ? extname(file.filename) : '');

    // Corregir extensiones mal escritas comunes
    if (ext.toLowerCase() === '.jepg') ext = '.jpeg';

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

    // Corregir mimeType si la extensión era .jepg u otra variante de JPEG
    let mimeType = file.mimetype || 'application/octet-stream';
    const lowerExt = ext.toLowerCase();
    if (
      (lowerExt === '.jpg' || lowerExt === '.jpeg') &&
      !mimeType.startsWith('image/')
    ) {
      mimeType = 'image/jpeg';
    }

    return this.prisma.mediaAsset.create({
      data: {
        filename,
        mimeType,
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

  /**
   * ZIP de Google Fonts (u otro pack tipográfico):
   * extrae woff2/woff/ttf/otf, los sube y devuelve caras con peso/estilo.
   */
  async importFontPack(
    file?: Express.Multer.File,
    folderId?: string | null,
  ): Promise<{ familyHint: string; faces: FontFaceOut[]; count: number }> {
    if (!file) throw new BadRequestException('ZIP requerido');
    const name = (file.originalname || file.filename || '').toLowerCase();
    if (!name.endsWith('.zip') && file.mimetype !== 'application/zip') {
      throw new BadRequestException('Sube el ZIP descargado desde Google Fonts');
    }
    if (folderId) await this.folderById(folderId);

    let buffer: Buffer;
    if (file.buffer) buffer = file.buffer;
    else if (file.path) buffer = readFileSync(file.path);
    else throw new BadRequestException('Archivo ZIP inválido');

    let zip: AdmZip;
    try {
      zip = new AdmZip(buffer);
    } catch {
      throw new BadRequestException('No se pudo leer el ZIP');
    }

    const entries = zip
      .getEntries()
      .filter((e) => !e.isDirectory)
      .map((e) => ({
        entryName: e.entryName,
        buffer: e.getData(),
      }));

    const selected = selectBestFaces(entries);
    if (selected.length === 0) {
      throw new BadRequestException(
        'No se encontraron fuentes (.woff2, .woff, .ttf, .otf) en el ZIP',
      );
    }
    if (selected.length > 40) {
      throw new BadRequestException('Demasiadas caras en el ZIP (máx. 40)');
    }

    const faces: FontFaceOut[] = [];
    const rows: Array<{
      id: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      url: string;
      alt: string | null;
      folderId: string | null;
    }> = [];

    // Subidas en paralelo (límite 4) — la DB de Supabase suele ser el cuello de botella
    const queue = [...selected];
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        const face = queue.shift();
        if (!face) return;
        const id = randomUUID();
        const safeBase = face.basename.replace(/[^\w.\-[\],]+/g, '_');
        const localName = `${id}${face.ext}`;
        const objectKey = `cms/media/${id}${face.ext}`;
        const mime = FONT_MIME[face.ext] || 'application/octet-stream';
        const uploaded = await this.storage.uploadBuffer(
          face.buffer,
          objectKey,
          mime,
          localName,
        );
        rows.push({
          id,
          filename: safeBase,
          mimeType: mime,
          sizeBytes: face.buffer.length,
          url: uploaded.url,
          alt: `font ${face.weight} ${face.style}`,
          folderId: folderId || null,
        });
        faces.push({
          id,
          url: uploaded.url,
          filename: safeBase,
          weight: face.weight,
          style: face.style,
          mimeType: mime,
          variable: Boolean(face.variable),
        });
      }
    });
    await Promise.all(workers);

    if (rows.length) {
      await this.prisma.mediaAsset.createMany({ data: rows });
    }

    faces.sort((a, b) => a.weight - b.weight || a.style.localeCompare(b.style));

    return {
      familyHint: guessFamilyName(selected.map((s) => s.entryName)),
      faces,
      count: faces.length,
    };
  }
}
