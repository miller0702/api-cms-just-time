import type { LeadNotificationInput } from './lead-routing';

/**
 * Destinatarios por tipo de solicitud (RF-CMS-LEAD-002). Cada buzón se
 * configura por entorno; `LEADS_EMAIL_DEFAULT` cubre lo que no tenga buzón
 * propio. Sin variables, el envío queda desactivado y solo hay aviso in-app.
 */
const RECIPIENT_ENV_BY_KIND: Record<string, string> = {
  pqrs: 'LEADS_EMAIL_PQRS',
  fleet: 'LEADS_EMAIL_FLEET',
  fleet_availability: 'LEADS_EMAIL_FLEET',
  lot_inquiry: 'LEADS_EMAIL_LOT',
  contact: 'LEADS_EMAIL_CONTACT',
};

function parseList(value?: string) {
  return (value || '')
    .split(/[,;]/)
    .map((address) => address.trim())
    .filter(Boolean);
}

export function leadMailRecipients(
  kind: string | null | undefined,
  env: Record<string, string | undefined>,
) {
  const key = RECIPIENT_ENV_BY_KIND[kind || 'contact'] || 'LEADS_EMAIL_CONTACT';
  const specific = parseList(env[key]);
  const recipients = specific.length
    ? specific
    : parseList(env.LEADS_EMAIL_DEFAULT);
  return [...new Set(recipients.map((address) => address.toLowerCase()))];
}

export function buildLeadEmail(
  lead: LeadNotificationInput,
  route: { title: string; body: string; href: string },
  siteUrl?: string,
) {
  const lines = [
    route.title,
    '',
    `Nombre: ${lead.name}`,
    `Contacto: ${lead.email?.trim() || lead.phone?.trim() || 'sin contacto'}`,
  ];
  if (lead.phone?.trim() && lead.email?.trim()) {
    lines.push(`Teléfono: ${lead.phone.trim()}`);
  }
  if (lead.company?.trim()) lines.push(`Empresa: ${lead.company.trim()}`);
  if (lead.subject?.trim()) lines.push(`Asunto: ${lead.subject.trim()}`);
  if (lead.municipality?.trim())
    lines.push(`Municipio: ${lead.municipality.trim()}`);
  if (lead.projectSlug?.trim())
    lines.push(`Proyecto: ${lead.projectSlug.trim()}`);
  if (lead.lotCode?.trim()) lines.push(`Lote: ${lead.lotCode.trim()}`);
  if (lead.trackingCode?.trim()) {
    lines.push(`Código de seguimiento: ${lead.trackingCode.trim()}`);
  }
  if (lead.message?.trim()) lines.push('', 'Mensaje:', lead.message.trim());
  lines.push(
    '',
    `Abrir en el panel: ${(siteUrl || '').replace(/\/$/, '')}${route.href}`,
  );

  return {
    subject: `[Just Time] ${route.title} — ${lead.name}`,
    text: lines.join('\n'),
  };
}

/** Acuse al ciudadano con su radicado (RF-CMS-PQRS: estado consultable). */
export function buildPqrsAckEmail(
  lead: LeadNotificationInput,
  siteUrl?: string,
) {
  if (lead.kind !== 'pqrs' || !lead.trackingCode || !lead.email?.trim())
    return null;
  const base = (siteUrl || '').replace(/\/$/, '');
  return {
    to: lead.email.trim(),
    subject: `Radicado ${lead.trackingCode} — Just Time`,
    text: [
      `Hola ${lead.name},`,
      '',
      'Recibimos tu solicitud. Este es tu código de seguimiento:',
      lead.trackingCode,
      '',
      base
        ? `Consulta el estado en ${base}/pqrs`
        : 'Consulta el estado en nuestra página de PQRS.',
      '',
      'Just Time SAS',
    ].join('\n'),
  };
}
