import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ErpUrbanismoClient } from '../projects/erp-urbanismo.client';
import { CreateLeadDto } from './dto/create-lead.dto';
import {
  appendFleetDetailsToMessage,
  buildFleetLeadSubject,
  isFleetAvailabilityRequest,
} from './fleet-lead';
import {
  addContactToSpamBlocklist,
  isSpamContact,
  LEADS_SPAM_SETTING_KEY,
  loadSpamBlocklist,
  parseSpamBlocklist,
} from './spam-blocklist';

const SPAM_OK = {
  id: 'spam',
  status: 'spam',
  trackingCode: null,
  message: 'ok',
  erpSynced: false,
} as const;

export function createPqrsTrackingCode(
  now = Date.now(),
  entropy = randomBytes(8).toString('hex'),
) {
  return `PQRS-${now.toString(36).toUpperCase()}-${entropy.toUpperCase()}`;
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly erp: ErpUrbanismoClient,
  ) {}

  async create(dto: CreateLeadDto) {
    // Honeypot: bots rellenan "website"; humanos no lo ven.
    if (dto.website?.trim()) {
      return { ...SPAM_OK };
    }

    const blocklist = await loadSpamBlocklist(this.prisma);
    if (isSpamContact({ email: dto.email, phone: dto.phone }, blocklist).blocked) {
      return { ...SPAM_OK };
    }

    let kind =
      dto.kind === 'fleet_availability' ? 'fleet' : dto.kind || 'contact';
    if (!dto.kind) {
      if (dto.vehicleTypeId || dto.source?.includes('fleet')) kind = 'fleet';
      else if (dto.projectSlug || dto.lotCode) kind = 'lot_inquiry';
    }

    if (kind === 'pqrs' && !dto.pqrsType) {
      throw new BadRequestException('Tipo PQRS requerido');
    }
    if (dto.consent !== true) {
      throw new BadRequestException(
        'Debes aceptar el tratamiento de datos personales',
      );
    }

    // Solo las consultas de disponibilidad (?fleet=1 / kind fleet) exigen equipo y fecha.
    // Una cotización hidrocarburos con tipo de equipo opcional sigue siendo lead fleet, sin bloquear.
    const fleetRequest = isFleetAvailabilityRequest({
      kind: dto.kind,
      source: dto.source,
    });
    if (fleetRequest) {
      kind = 'fleet';
      if (!dto.vehicleTypeId?.trim()) {
        throw new BadRequestException('Selecciona el tipo de equipo');
      }
      if (!dto.dateFrom?.trim()) {
        throw new BadRequestException(
          'Indica la fecha desde la que necesitas el equipo',
        );
      }
    }

    const trackingCode = kind === 'pqrs' ? createPqrsTrackingCode() : null;
    const vehicleTypeName =
      kind === 'fleet'
        ? await this.resolveVehicleTypeName(dto.vehicleTypeId)
        : null;
    const message =
      kind === 'fleet'
        ? appendFleetDetailsToMessage(dto.message, {
            vehicleTypeId: dto.vehicleTypeId,
            vehicleTypeName,
            dateFrom: dto.dateFrom,
            dateTo: dto.dateTo,
            municipality: dto.municipality,
            zone: dto.zone,
            estimatedDays: dto.estimatedDays,
            estimatedHours: dto.estimatedHours,
          })
        : dto.message;
    const subject =
      kind === 'fleet'
        ? buildFleetLeadSubject({
            vehicleTypeName,
            dateFrom: dto.dateFrom,
            dateTo: dto.dateTo,
          })
        : dto.subject;

    const lead = await this.prisma.lead.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        company: dto.company,
        message,
        source: dto.source ?? (kind === 'pqrs' ? 'website-pqrs' : 'website'),
        kind,
        pqrsType: dto.pqrsType,
        document: dto.document,
        municipality: dto.municipality,
        subject,
        consent: dto.consent === true,
        trackingCode,
        businessLine:
          dto.businessLine ?? (kind === 'fleet' ? 'hidrocarburos' : undefined),
        serviceSlug: dto.serviceSlug,
        projectSlug: dto.projectSlug,
        lotCode: dto.lotCode,
      },
    });
    void this.notifications.notifyLead(lead);

    let erpFleetLead: unknown = null;
    if (kind === 'fleet' && this.erp.configured) {
      try {
        erpFleetLead = await this.erp.createFleetAvailabilityLead({
          vehicleTypeId: dto.vehicleTypeId,
          dateFrom: dto.dateFrom,
          dateTo: dto.dateTo,
          municipality: dto.municipality,
          zone: dto.zone,
          estimatedHours: dto.estimatedHours,
          estimatedDays: dto.estimatedDays,
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          company: dto.company,
          message: dto.message,
          consent: true,
          source: 'cms-web',
        });
      } catch {
        // El lead ya quedó en el inbox del CMS; comercial lo retoma desde ahí.
        erpFleetLead = null;
      }
    }

    return { ...lead, erpSynced: Boolean(erpFleetLead), erpFleetLead };
  }

  private async resolveVehicleTypeName(vehicleTypeId?: string) {
    if (!vehicleTypeId?.trim() || !this.erp.configured) return null;
    try {
      const types = await this.erp.listFleetTypes();
      const match = types.find((type) => type.id === vehicleTypeId);
      return match?.name ?? null;
    } catch {
      return null;
    }
  }

  async pqrsPublicStatus(trackingCode: string) {
    const code = trackingCode?.trim();
    if (!code) throw new NotFoundException('Código no encontrado');
    const lead = await this.prisma.lead.findFirst({
      where: { trackingCode: code, kind: 'pqrs' },
      select: {
        trackingCode: true,
        status: true,
        pqrsType: true,
        subject: true,
        createdAt: true,
      },
    });
    if (!lead) throw new NotFoundException('Código no encontrado');
    const statusLabel: Record<string, string> = {
      new: 'Recibido',
      in_progress: 'En trámite',
      done: 'Cerrado',
      spam: 'Descartado',
    };
    return {
      trackingCode: lead.trackingCode,
      status: lead.status,
      statusLabel: statusLabel[lead.status] || lead.status,
      pqrsType: lead.pqrsType,
      subject: lead.subject,
      createdAt: lead.createdAt,
    };
  }

  list(kind?: string) {
    return this.prisma.lead.findMany({
      where: kind ? { kind } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(
    id: string,
    status: string,
    options?: { blockContact?: boolean },
  ) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead no encontrado');
    const allowed = ['new', 'in_progress', 'done', 'spam'];
    if (!allowed.includes(status)) {
      throw new BadRequestException('Estado no válido');
    }
    const updated = await this.prisma.lead.update({
      where: { id },
      data: { status },
    });
    if (status === 'spam' && options?.blockContact) {
      await this.blockContact({ email: lead.email, phone: lead.phone });
    }
    return updated;
  }

  async getSpamBlocklist() {
    return loadSpamBlocklist(this.prisma);
  }

  async setSpamBlocklist(raw: unknown) {
    const value = parseSpamBlocklist(raw);
    const json = value as unknown as Prisma.InputJsonValue;
    await this.prisma.siteSetting.upsert({
      where: { key: LEADS_SPAM_SETTING_KEY },
      create: { key: LEADS_SPAM_SETTING_KEY, value: json },
      update: { value: json },
    });
    // Devuelve la lista efectiva (env + panel) para que el admin vea todo.
    return loadSpamBlocklist(this.prisma);
  }

  private async blockContact(input: {
    email?: string | null;
    phone?: string | null;
  }) {
    const row = await this.prisma.siteSetting.findUnique({
      where: { key: LEADS_SPAM_SETTING_KEY },
    });
    const current = parseSpamBlocklist(row?.value);
    const next = addContactToSpamBlocklist(current, input);
    const json = next as unknown as Prisma.InputJsonValue;
    await this.prisma.siteSetting.upsert({
      where: { key: LEADS_SPAM_SETTING_KEY },
      create: { key: LEADS_SPAM_SETTING_KEY, value: json },
      update: { value: json },
    });
    return next;
  }

  listFleetTypes() {
    if (!this.erp.configured) return [];
    return this.erp.listFleetTypes().catch(() => []);
  }
}
