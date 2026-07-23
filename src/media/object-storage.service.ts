import { Injectable, Logger } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { createReadStream, existsSync, unlinkSync } from 'fs';
import { basename, resolve } from 'path';

/**
 * Almacenamiento de media: GCS si hay GCS_BUCKET; si no, disco local (/uploads).
 */
@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly bucketName = process.env.GCS_BUCKET?.trim() || '';
  private readonly publicBase =
    process.env.GCS_PUBLIC_BASE_URL?.trim().replace(/\/$/, '') || '';
  private storage: Storage | null = null;

  isEnabled() {
    return Boolean(this.bucketName);
  }

  private getStorage() {
    if (!this.storage) {
      const keyRaw =
        process.env.GCS_KEY_FILE?.trim() ||
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
      const keyFile = keyRaw ? resolve(process.cwd(), keyRaw) : undefined;
      const projectId =
        process.env.GCS_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
      this.storage = keyFile
        ? new Storage({ keyFilename: keyFile, projectId })
        : new Storage({ projectId });
    }
    return this.storage;
  }

  private publicUrl(objectKey: string) {
    if (this.publicBase) return `${this.publicBase}/${objectKey}`;
    return `https://storage.googleapis.com/${this.bucketName}/${objectKey}`;
  }

  /** Sube un archivo de Multer (disk o memory) y devuelve URL pública + key. */
  async uploadMulterFile(
    file: Express.Multer.File,
    objectKey: string,
  ): Promise<{ url: string; key: string }> {
    if (!this.isEnabled()) {
      const name = file.filename || basename(file.path || 'file');
      return { url: `/uploads/${name}`, key: objectKey };
    }

    const bucket = this.getStorage().bucket(this.bucketName);
    const blob = bucket.file(objectKey);
    const contentType = file.mimetype || 'application/octet-stream';

    if (file.buffer) {
      await blob.save(file.buffer, {
        resumable: false,
        contentType,
        metadata: { cacheControl: 'public, max-age=31536000' },
      });
    } else if (file.path) {
      await new Promise<void>((resolvePromise, reject) => {
        createReadStream(file.path)
          .pipe(
            blob.createWriteStream({
              resumable: false,
              contentType,
              metadata: { cacheControl: 'public, max-age=31536000' },
            }),
          )
          .on('error', reject)
          .on('finish', () => resolvePromise());
      });
      try {
        unlinkSync(file.path);
      } catch {
        /* ignore */
      }
    } else {
      throw new Error('Archivo Multer sin buffer ni path');
    }

    try {
      await blob.makePublic();
    } catch (err) {
      this.logger.warn(
        `makePublic falló (¿IAM uniforme?). Usa GCS_PUBLIC_BASE_URL o ACL de bucket: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return { url: this.publicUrl(objectKey), key: objectKey };
  }

  async deleteByUrl(url: string) {
    if (!url) return;

    if (url.startsWith('/uploads/')) {
      const local = `${process.cwd()}${url}`;
      if (existsSync(local)) {
        try {
          unlinkSync(local);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    if (!this.isEnabled()) return;

    let key = '';
    const gcsMatch = url.match(/storage\.googleapis\.com\/[^/]+\/(.+)$/);
    if (this.publicBase && url.startsWith(`${this.publicBase}/`)) {
      key = url.slice(this.publicBase.length + 1);
    } else if (gcsMatch) {
      key = decodeURIComponent(gcsMatch[1]);
    }
    if (!key) return;

    try {
      await this.getStorage()
        .bucket(this.bucketName)
        .file(key)
        .delete({ ignoreNotFound: true });
    } catch (err) {
      this.logger.warn(
        `No se pudo borrar ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
