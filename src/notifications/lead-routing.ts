export type LeadNotificationInput = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  message?: string | null;
  kind?: string | null;
  pqrsType?: string | null;
  businessLine?: string | null;
  serviceSlug?: string | null;
  projectSlug?: string | null;
  lotCode?: string | null;
  trackingCode?: string | null;
  subject?: string | null;
  municipality?: string | null;
};

const PQRS_TYPE_LABEL: Record<string, string> = {
  peticion: 'Petición',
  queja: 'Queja',
  reclamo: 'Reclamo',
  sugerencia: 'Sugerencia',
};

/**
 * Enruta cada solicitud pública al buzón que la atiende (RF-CMS-LEAD-002):
 * PQRS a servicio al cliente, flota a comercial, lotes a urbanismo.
 */
export function leadNotificationRoute(lead: LeadNotificationInput) {
  const who = lead.company ? `${lead.name} (${lead.company})` : lead.name;
  const contact = lead.email?.trim() || lead.phone?.trim() || 'sin contacto';
  const kind = lead.kind || 'contact';
  const parts = [who, contact];

  if (kind === 'pqrs') {
    const label = lead.pqrsType
      ? PQRS_TYPE_LABEL[lead.pqrsType] || lead.pqrsType
      : 'PQRS';
    if (lead.trackingCode) parts.push(lead.trackingCode);
    return {
      title: `PQRS · ${label}`,
      body: parts.join(' · '),
      href: '/admin/leads?kind=pqrs',
    };
  }
  if (kind === 'fleet' || kind === 'fleet_availability') {
    if (lead.subject) parts.push(lead.subject);
    else if (lead.municipality) parts.push(lead.municipality);
    else if (lead.businessLine) parts.push(lead.businessLine);
    return {
      title: 'Solicitud de flota',
      body: parts.join(' · '),
      href: '/admin/leads?kind=fleet',
    };
  }
  if (kind === 'lot_inquiry') {
    if (lead.projectSlug) parts.push(lead.projectSlug);
    if (lead.lotCode) parts.push(`lote ${lead.lotCode}`);
    return {
      title: 'Interés en un lote',
      body: parts.join(' · '),
      href: '/admin/leads?kind=lot_inquiry',
    };
  }
  if (lead.serviceSlug || lead.businessLine) {
    parts.push(lead.serviceSlug || (lead.businessLine as string));
  }
  return {
    title: 'Nueva cotización',
    body: parts.join(' · '),
    href: '/admin/leads?kind=contact',
  };
}
