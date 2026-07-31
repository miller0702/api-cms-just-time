import { Injectable, Logger } from '@nestjs/common';
import type { Transporter } from 'nodemailer';

export type MailMessage = {
  to: string[] | string;
  subject: string;
  text: string;
};

/**
 * Envío SMTP para avisos de leads. Si faltan credenciales degrada con gracia:
 * el API público sigue funcionando y solo queda la notificación in-app.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private transporterPromise: Promise<Transporter | null> | null = null;

  get configured() {
    return Boolean(process.env.SMTP_HOST?.trim() && this.from);
  }

  private get from() {
    return process.env.MAIL_FROM?.trim() || process.env.SMTP_USER?.trim() || '';
  }

  private async getTransporter() {
    if (this.transporter) return this.transporter;
    if (!this.configured) return null;
    if (!this.transporterPromise) {
      this.transporterPromise = this.createTransporter();
    }
    this.transporter = await this.transporterPromise;
    return this.transporter;
  }

  private async createTransporter() {
    try {
      // Import diferido: sin SMTP configurado no cargamos nodemailer.
      const nodemailer = await import('nodemailer');
      const port = Number(process.env.SMTP_PORT || 587);
      const user = process.env.SMTP_USER?.trim();
      const pass = process.env.SMTP_PASSWORD?.trim();
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST?.trim(),
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
      });
      this.logger.log('SMTP listo para avisos de leads');
      return transporter;
    } catch (err) {
      this.logger.warn(
        `No se pudo inicializar SMTP: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  async send(message: MailMessage) {
    const to = Array.isArray(message.to) ? message.to : [message.to];
    if (!to.length) return false;
    const transporter = await this.getTransporter();
    if (!transporter) return false;
    try {
      await transporter.sendMail({
        from: this.from,
        to: to.join(', '),
        subject: message.subject,
        text: message.text,
      });
      return true;
    } catch (err) {
      this.logger.warn(
        `No se pudo enviar el correo "${message.subject}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }
}
