/**
 * Detalle operativo de una solicitud de disponibilidad de flota (HU-CMS-012 /
 * RF-CMS-FLT-002). Se embebe en el mensaje del lead CMS para que el inbox
 * conserve fechas y zona aunque el ERP no responda.
 */

export type FleetLeadDetails = {
  vehicleTypeId?: string | null;
  vehicleTypeName?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  municipality?: string | null;
  zone?: string | null;
  estimatedDays?: number | null;
  estimatedHours?: number | null;
};

export function isFleetAvailabilityRequest(input: {
  kind?: string | null;
  source?: string | null;
}) {
  return (
    input.kind === 'fleet' ||
    input.kind === 'fleet_availability' ||
    Boolean(input.source?.toLowerCase().includes('fleet'))
  );
}

export function buildFleetLeadSubject(details: FleetLeadDetails) {
  const parts = ['Disponibilidad'];
  if (details.vehicleTypeName?.trim())
    parts.push(details.vehicleTypeName.trim());
  if (details.dateFrom || details.dateTo) {
    parts.push(`${details.dateFrom || '?'} → ${details.dateTo || '?'}`);
  }
  return parts.join(' · ');
}

export function appendFleetDetailsToMessage(
  message: string,
  details: FleetLeadDetails,
) {
  const lines: string[] = [];
  if (details.vehicleTypeName?.trim()) {
    lines.push(`Equipo: ${details.vehicleTypeName.trim()}`);
  } else if (details.vehicleTypeId?.trim()) {
    lines.push(`Equipo (id): ${details.vehicleTypeId.trim()}`);
  }
  if (details.dateFrom || details.dateTo) {
    lines.push(`Fechas: ${details.dateFrom || '?'} → ${details.dateTo || '?'}`);
  }
  if (details.municipality?.trim()) {
    lines.push(`Municipio: ${details.municipality.trim()}`);
  }
  if (details.zone?.trim()) lines.push(`Zona: ${details.zone.trim()}`);
  if (details.estimatedDays != null) {
    lines.push(`Días estimados: ${details.estimatedDays}`);
  }
  if (details.estimatedHours != null) {
    lines.push(`Horas estimadas: ${details.estimatedHours}`);
  }
  if (!lines.length) return message.trim();
  return `${message.trim()}\n\n---\nDetalle de flota\n${lines.join('\n')}`;
}
