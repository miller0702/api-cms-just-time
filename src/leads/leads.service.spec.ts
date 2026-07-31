jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class NotificationsService {},
}));

import { validate } from 'class-validator';
import {
  buildLeadEmail,
  buildPqrsAckEmail,
  leadMailRecipients,
} from '../notifications/lead-mail';
import { leadNotificationRoute } from '../notifications/lead-routing';
import { ProjectsService } from '../projects/projects.service';
import { CreateLotInquiryDto } from '../projects/dto/create-lot-inquiry.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import {
  appendFleetDetailsToMessage,
  buildFleetLeadSubject,
} from './fleet-lead';
import {
  addContactToSpamBlocklist,
  isSpamContact,
  mergeSpamBlocklists,
  parseSpamBlocklist,
  spamBlocklistFromEnv,
} from './spam-blocklist';
import { createPqrsTrackingCode, LeadsService } from './leads.service';

function service(options: { erpFails?: boolean; vehicleName?: string; spam?: unknown } = {}) {
  const created: Array<Record<string, unknown>> = [];
  const notified: Array<Record<string, unknown>> = [];
  const prisma = {
    lead: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return Promise.resolve({ id: 'lead-1', status: 'new', ...data });
      },
    },
    siteSetting: {
      findUnique: () =>
        Promise.resolve(
          options.spam !== undefined
            ? { key: 'leads_spam', value: options.spam }
            : null,
        ),
      upsert: ({ create }: { create: { value: unknown } }) =>
        Promise.resolve({ key: 'leads_spam', value: create.value }),
    },
  };
  const notifications = {
    notifyLead: (lead: Record<string, unknown>) => {
      notified.push(lead);
      return Promise.resolve();
    },
  };
  const erp = {
    configured: true,
    listFleetTypes: () =>
      Promise.resolve([
        { id: 'vt-1', name: options.vehicleName || 'Volqueta 14 m³' },
      ]),
    createFleetAvailabilityLead: () =>
      options.erpFails
        ? Promise.reject(new Error('ERP caído'))
        : Promise.resolve({ id: 'erp-fleet-1' }),
  };
  return {
    leads: new LeadsService(
      prisma as never,
      notifications as never,
      erp as never,
    ),
    created,
    notified,
  };
}

function projectsService(
  options: { erpFails?: boolean; recent?: unknown } = {},
) {
  const created: Array<Record<string, unknown>> = [];
  const notified: Array<Record<string, unknown>> = [];
  const prisma = {
    lead: {
      findFirst: () => Promise.resolve(options.recent ?? null),
      create: ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return Promise.resolve({ id: 'lead-lote', status: 'new', ...data });
      },
    },
    siteSetting: {
      findUnique: () => Promise.resolve(null),
    },
  };
  const erp = {
    configured: true,
    createInterest: () =>
      options.erpFails
        ? Promise.reject(new Error('ERP caído'))
        : Promise.resolve({ id: 'erp-1' }),
  };
  const notifications = {
    notifyLead: (lead: Record<string, unknown>) => {
      notified.push(lead);
      return Promise.resolve();
    },
  };
  const projects = new ProjectsService(
    prisma as never,
    erp as never,
    notifications as never,
  );
  jest
    .spyOn(
      projects as unknown as {
        resolveErpIdBySlug: (slug: string) => Promise<string>;
      },
      'resolveErpIdBySlug',
    )
    .mockResolvedValue('erp-project-1');
  return { projects, created, notified };
}

describe('protecciones de leads públicos', () => {
  it('genera códigos PQRS con entropía no enumerable', () => {
    expect(createPqrsTrackingCode(1_234, '0123456789abcdef')).toBe(
      'PQRS-YA-0123456789ABCDEF',
    );
  });

  it('rechaza cualquier lead sin consentimiento verdadero', async () => {
    await expect(
      service().leads.create({
        name: 'Cliente',
        email: 'cliente@example.com',
        message: 'Quiero una cotización',
        consent: false,
      }),
    ).rejects.toThrow(/tratamiento de datos/i);
  });

  it('valida consentimiento verdadero en los DTO públicos', async () => {
    const lead = Object.assign(new CreateLeadDto(), {
      name: 'Cliente',
      email: 'cliente@example.com',
      message: 'Quiero una cotización',
      consent: false,
    });
    const lot = Object.assign(new CreateLotInquiryDto(), {
      name: 'Cliente',
      email: 'cliente@example.com',
      consentAccepted: false,
    });
    expect(
      (await validate(lead)).some((error) => error.property === 'consent'),
    ).toBe(true);
    expect(
      (await validate(lot)).some(
        (error) => error.property === 'consentAccepted',
      ),
    ).toBe(true);
  });

  it('exige al menos correo o teléfono para consultar un lote', async () => {
    const projects = new ProjectsService({} as never, {} as never, {} as never);
    await expect(
      projects.createLotInquiry(
        'proyecto',
        'lote-1',
        {
          name: 'Cliente',
          consentAccepted: true,
        },
        'key-1',
      ),
    ).rejects.toThrow(/correo o teléfono/i);
  });

  it('descarta honeypots de lote sin tocar el ERP', async () => {
    const projects = new ProjectsService({} as never, {} as never, {} as never);
    await expect(
      projects.createLotInquiry(
        'proyecto',
        'lote-1',
        {
          name: 'Bot',
          email: 'bot@example.com',
          consentAccepted: true,
          website: 'https://spam.example',
        },
        'key-2',
      ),
    ).resolves.toMatchObject({ status: 'spam' });
  });

  it('guarda el interés de lote en el inbox del CMS y avisa a urbanismo', async () => {
    const { projects, created, notified } = projectsService();
    const result = await projects.createLotInquiry(
      'ciudadela-norte',
      'lote-uuid',
      {
        name: 'Cliente',
        email: 'cliente@example.com',
        consentAccepted: true,
        lotCode: 'A-14',
      },
      'key-3',
    );
    expect(result).toMatchObject({ id: 'lead-lote', erpSynced: true });
    expect(created[0]).toMatchObject({
      kind: 'lot_inquiry',
      projectSlug: 'ciudadela-norte',
      lotCode: 'A-14',
      consent: true,
    });
    expect(notified).toHaveLength(1);
  });

  it('conserva el lead aunque el ERP no responda', async () => {
    const { projects, created } = projectsService({ erpFails: true });
    const result = await projects.createLotInquiry(
      'ciudadela-norte',
      'lote-uuid',
      { name: 'Cliente', phone: '3001234567', consentAccepted: true },
      'key-4',
    );
    expect(result.erpSynced).toBe(false);
    expect(created).toHaveLength(1);
  });

  it('no duplica el lead si el visitante reenvía el formulario', async () => {
    const { projects, created, notified } = projectsService({
      recent: { id: 'lead-previo', status: 'new' },
    });
    const result = await projects.createLotInquiry(
      'ciudadela-norte',
      'lote-uuid',
      { name: 'Cliente', email: 'cliente@example.com', consentAccepted: true },
      'key-5',
    );
    expect(result.id).toBe('lead-previo');
    expect(created).toHaveLength(0);
    expect(notified).toHaveLength(0);
  });

  it('enruta cada solicitud al buzón que la atiende', () => {
    expect(
      leadNotificationRoute({
        id: '1',
        name: 'Ana',
        email: 'ana@example.com',
        kind: 'pqrs',
        pqrsType: 'queja',
        trackingCode: 'PQRS-XYZ',
      }),
    ).toMatchObject({ title: 'PQRS · Queja', href: '/admin/leads?kind=pqrs' });
    expect(
      leadNotificationRoute({
        id: '2',
        name: 'Beto',
        phone: '3001234567',
        kind: 'fleet',
        subject: 'Disponibilidad · Volqueta 14 m³ · 2026-08-01 → 2026-08-05',
      }),
    ).toMatchObject({
      title: 'Solicitud de flota',
      body: 'Beto · 3001234567 · Disponibilidad · Volqueta 14 m³ · 2026-08-01 → 2026-08-05',
      href: '/admin/leads?kind=fleet',
    });
    expect(
      leadNotificationRoute({
        id: '3',
        name: 'Caro',
        email: 'caro@example.com',
        kind: 'lot_inquiry',
        projectSlug: 'ciudadela-norte',
        lotCode: 'A-14',
      }),
    ).toMatchObject({
      title: 'Interés en un lote',
      href: '/admin/leads?kind=lot_inquiry',
    });
    expect(leadNotificationRoute({ id: '4', name: 'Dani' })).toMatchObject({
      title: 'Nueva cotización',
      body: 'Dani · sin contacto',
      href: '/admin/leads?kind=contact',
    });
  });

  it('exige equipo y fecha en consultas de disponibilidad de flota', async () => {
    await expect(
      service().leads.create({
        name: 'Obra',
        email: 'obra@example.com',
        message: 'Necesito una volqueta',
        kind: 'fleet',
        source: 'website-fleet',
        consent: true,
      }),
    ).rejects.toThrow(/tipo de equipo/i);
    await expect(
      service().leads.create({
        name: 'Obra',
        email: 'obra@example.com',
        message: 'Necesito una volqueta',
        kind: 'fleet_availability',
        vehicleTypeId: 'vt-1',
        consent: true,
      }),
    ).rejects.toThrow(/fecha/i);
  });

  it('guarda el lead de flota con detalle operativo y avisa al coordinador', async () => {
    const { leads, created, notified } = service();
    const result = await leads.create({
      name: 'Obra Caribe',
      email: 'obra@example.com',
      message: 'Para movimiento de material',
      kind: 'fleet',
      source: 'website-fleet',
      vehicleTypeId: 'vt-1',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-05',
      municipality: 'Valledupar',
      zone: 'Pozo Norte',
      estimatedDays: 4,
      consent: true,
    });
    expect(result).toMatchObject({ kind: 'fleet', erpSynced: true });
    expect(created[0]).toMatchObject({
      kind: 'fleet',
      businessLine: 'hidrocarburos',
      municipality: 'Valledupar',
      subject: 'Disponibilidad · Volqueta 14 m³ · 2026-08-01 → 2026-08-05',
    });
    expect(String(created[0].message)).toContain('Detalle de flota');
    expect(String(created[0].message)).toContain('Valledupar');
    expect(notified).toHaveLength(1);
  });

  it('conserva el lead de flota aunque el ERP no responda', async () => {
    const { leads, created } = service({ erpFails: true });
    const result = await leads.create({
      name: 'Obra',
      email: 'obra@example.com',
      message: 'Urgente',
      source: 'website-fleet',
      vehicleTypeId: 'vt-1',
      dateFrom: '2026-08-01',
      consent: true,
    });
    expect(result.erpSynced).toBe(false);
    expect(created).toHaveLength(1);
  });

  it('envía cada tipo al buzón configurado y cae al default', () => {
    const env = {
      LEADS_EMAIL_PQRS: 'pqrs@justtimesas.com',
      LEADS_EMAIL_FLEET: 'flota@justtimesas.com, comercial@justtimesas.com',
      LEADS_EMAIL_DEFAULT: 'admin@justtimesas.com',
    };
    expect(leadMailRecipients('pqrs', env)).toEqual(['pqrs@justtimesas.com']);
    expect(leadMailRecipients('fleet_availability', env)).toEqual([
      'flota@justtimesas.com',
      'comercial@justtimesas.com',
    ]);
    expect(leadMailRecipients('lot_inquiry', env)).toEqual([
      'admin@justtimesas.com',
    ]);
    expect(leadMailRecipients('contact', {})).toEqual([]);
  });

  it('arma el correo interno con el detalle y el enlace al panel', () => {
    const lead = {
      id: 'lead-9',
      name: 'Obra Caribe',
      email: 'obra@example.com',
      company: 'Caribe SAS',
      kind: 'fleet',
      subject: 'Disponibilidad · Volqueta',
      municipality: 'Valledupar',
      message: 'Necesito 2 equipos',
    };
    const mail = buildLeadEmail(
      lead,
      leadNotificationRoute(lead),
      'https://panel.justtimesas.com/',
    );
    expect(mail.subject).toBe('[Just Time] Solicitud de flota — Obra Caribe');
    expect(mail.text).toContain('Municipio: Valledupar');
    expect(mail.text).toContain(
      'https://panel.justtimesas.com/admin/leads?kind=fleet',
    );
  });

  it('acusa recibo al ciudadano solo cuando el PQRS trae correo', () => {
    expect(
      buildPqrsAckEmail({
        id: '1',
        name: 'Ana',
        kind: 'pqrs',
        trackingCode: 'PQRS-ABC',
        email: 'ana@example.com',
      })?.subject,
    ).toBe('Radicado PQRS-ABC — Just Time');
    expect(
      buildPqrsAckEmail({
        id: '2',
        name: 'Ana',
        kind: 'pqrs',
        trackingCode: 'PQRS-ABC',
      }),
    ).toBeNull();
    expect(
      buildPqrsAckEmail({
        id: '3',
        name: 'Beto',
        kind: 'contact',
        email: 'b@example.com',
      }),
    ).toBeNull();
  });

  it('bloquea contactos de la lista spam sin dejar rastro', async () => {
    const { leads, created, notified } = service({
      spam: { emails: ['bot@spam.example'], domains: ['evil.test'], phones: ['3001112233'] },
    });
    await expect(
      leads.create({
        name: 'Bot',
        email: 'bot@spam.example',
        message: 'Oferta increíble',
        consent: true,
      }),
    ).resolves.toMatchObject({ status: 'spam' });
    await expect(
      leads.create({
        name: 'Otro',
        email: 'x@evil.test',
        message: 'Oferta increíble',
        consent: true,
      }),
    ).resolves.toMatchObject({ status: 'spam' });
    expect(created).toHaveLength(0);
    expect(notified).toHaveLength(0);
  });

  it('detecta spam por correo, dominio y teléfono', () => {
    const list = parseSpamBlocklist({
      emails: 'A@X.com',
      domains: '@Bad.COM',
      phones: '+57 300 111 2233',
    });
    expect(list).toEqual({
      emails: ['a@x.com'],
      domains: ['bad.com'],
      phones: ['3001112233'],
    });
    expect(isSpamContact({ email: 'a@x.com' }, list).blocked).toBe(true);
    expect(isSpamContact({ email: 'hola@bad.com' }, list).reason).toBe('domain');
    expect(isSpamContact({ phone: '573001112233' }, list).reason).toBe('phone');
    expect(
      mergeSpamBlocklists(spamBlocklistFromEnv({ LEADS_SPAM_EMAILS: 'z@z.com' }), list)
        .emails,
    ).toContain('z@z.com');
    expect(
      addContactToSpamBlocklist(list, { email: 'nuevo@x.com', phone: '301' }).emails,
    ).toContain('nuevo@x.com');
  });

  it('formatea el asunto y el detalle de flota para el inbox', () => {
    expect(
      buildFleetLeadSubject({
        vehicleTypeName: 'Excavadora',
        dateFrom: '2026-08-01',
        dateTo: '2026-08-03',
      }),
    ).toBe('Disponibilidad · Excavadora · 2026-08-01 → 2026-08-03');
    expect(
      appendFleetDetailsToMessage('Necesito apoyo', {
        vehicleTypeName: 'Excavadora',
        municipality: 'Riohacha',
        estimatedHours: 12,
      }),
    ).toContain('Equipo: Excavadora');
  });
});
