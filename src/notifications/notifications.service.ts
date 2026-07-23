import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

export type AdminNotificationPayload = {
  type: 'lead' | 'comment';
  title: string;
  body: string;
  href: string;
  entityId: string;
};

/**
 * Escribe notificaciones en Firestore y emite custom tokens para el CMS.
 * Si faltan credenciales, degrada con gracia (no tumba el API público).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private enabled = false;

  constructor() {
    this.init();
  }

  private loadServiceAccount(): ServiceAccount | null {
    // Preferir variables de entorno (Cloud Run / Secret Manager).
    const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
    let privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
    if (
      projectId &&
      clientEmail &&
      privateKey &&
      projectId !== 'your-project-id' &&
      clientEmail !== 'your-service-account@example.com'
    ) {
      if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        privateKey = privateKey.slice(1, -1);
      }
      if (privateKey.includes('\\n')) {
        privateKey = privateKey.replace(/\\n/g, '\n');
      }
      return { projectId, clientEmail, privateKey };
    }

    // Fallback local: JSON del service account
    const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
    if (pathEnv) {
      try {
        const abs = resolve(process.cwd(), pathEnv);
        const raw = JSON.parse(readFileSync(abs, 'utf8')) as ServiceAccount & {
          project_id?: string;
          client_email?: string;
          private_key?: string;
        };
        return {
          projectId: raw.projectId || raw.project_id,
          clientEmail: raw.clientEmail || raw.client_email,
          privateKey: raw.privateKey || raw.private_key,
        };
      } catch (err) {
        this.logger.warn(
          `No se pudo leer FIREBASE_SERVICE_ACCOUNT_PATH (${pathEnv}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return null;
  }

  private init() {
    const serviceAccount = this.loadServiceAccount();
    if (!serviceAccount?.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
      this.logger.warn(
        'Firebase Admin no configurado (FIREBASE_SERVICE_ACCOUNT_PATH o PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY). Notificaciones realtime desactivadas.',
      );
      return;
    }

    try {
      if (!getApps().length) {
        initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.projectId,
        });
      }
      this.enabled = true;
      this.logger.log('Firebase Admin listo para notificaciones');
    } catch (err) {
      this.logger.warn(
        `No se pudo inicializar Firebase Admin: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  isEnabled() {
    return this.enabled;
  }

  async createCustomToken(userId: string) {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'Firebase no está configurado en el servidor',
      );
    }
    const token = await getAuth().createCustomToken(userId);
    return { token };
  }

  async push(payload: AdminNotificationPayload) {
    if (!this.enabled) return;
    try {
      await getFirestore().collection('admin_notifications').add({
        type: payload.type,
        title: payload.title,
        body: payload.body,
        href: payload.href,
        entityId: payload.entityId,
        createdAt: FieldValue.serverTimestamp(),
        read: false,
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo escribir notificación Firestore: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async notifyLead(lead: {
    id: string;
    name: string;
    email: string;
    company?: string | null;
    message?: string | null;
  }) {
    const who = lead.company ? `${lead.name} (${lead.company})` : lead.name;
    await this.push({
      type: 'lead',
      title: 'Nueva cotización',
      body: `${who} · ${lead.email}`,
      href: '/admin/leads',
      entityId: lead.id,
    });
  }

  async notifyComment(comment: {
    id: string;
    authorName: string;
    body: string;
    contentType: string;
  }) {
    const snippet =
      comment.body.length > 80
        ? `${comment.body.slice(0, 77)}…`
        : comment.body;
    await this.push({
      type: 'comment',
      title: 'Nuevo comentario',
      body: `${comment.authorName}: ${snippet}`,
      href: '/admin/comentarios',
      entityId: comment.id,
    });
  }
}
