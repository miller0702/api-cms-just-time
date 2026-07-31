/**
 * Lista anti-spam de leads públicos (RF-CMS-LEAD-004).
 * Coincide por correo exacto, dominio (@ejemplo.com) o teléfono normalizado.
 */

export type SpamBlocklist = {
  emails: string[];
  domains: string[];
  phones: string[];
};

export const EMPTY_SPAM_BLOCKLIST: SpamBlocklist = {
  emails: [],
  domains: [],
  phones: [],
};

function uniq(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

export function normalizePhone(value?: string | null) {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  // Colombia: quedarse con los últimos 10 si viene con +57.
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

export function parseSpamBlocklist(raw: unknown): SpamBlocklist {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_SPAM_BLOCKLIST };
  const value = raw as Record<string, unknown>;
  const list = (key: string) =>
    Array.isArray(value[key])
      ? uniq(value[key].map((item) => String(item)))
      : typeof value[key] === 'string'
        ? uniq(String(value[key]).split(/[\n,;]+/))
        : [];
  return {
    emails: list('emails'),
    domains: list('domains').map((domain) => domain.replace(/^@/, '')),
    phones: list('phones').map((phone) => normalizePhone(phone)).filter(Boolean),
  };
}

/** Une variables de entorno (`LEADS_SPAM_EMAILS=a,b`) con la lista del panel. */
export function mergeSpamBlocklists(...lists: Array<SpamBlocklist | null | undefined>) {
  return {
    emails: uniq(lists.flatMap((list) => list?.emails || [])),
    domains: uniq(lists.flatMap((list) => list?.domains || [])),
    phones: uniq(
      lists.flatMap((list) => list?.phones || []).map((phone) => normalizePhone(phone)),
    ).filter(Boolean),
  };
}

export function spamBlocklistFromEnv(env: Record<string, string | undefined>) {
  return parseSpamBlocklist({
    emails: env.LEADS_SPAM_EMAILS,
    domains: env.LEADS_SPAM_DOMAINS,
    phones: env.LEADS_SPAM_PHONES,
  });
}

export function isSpamContact(
  input: { email?: string | null; phone?: string | null },
  blocklist: SpamBlocklist,
) {
  const email = input.email?.trim().toLowerCase() || '';
  if (email && blocklist.emails.includes(email)) {
    return { blocked: true as const, reason: 'email' as const };
  }
  if (email.includes('@')) {
    const domain = email.split('@')[1] || '';
    if (domain && blocklist.domains.includes(domain)) {
      return { blocked: true as const, reason: 'domain' as const };
    }
  }
  const phone = normalizePhone(input.phone);
  if (phone && blocklist.phones.includes(phone)) {
    return { blocked: true as const, reason: 'phone' as const };
  }
  return { blocked: false as const, reason: null };
}

export const LEADS_SPAM_SETTING_KEY = 'leads_spam';

type SettingReader = {
  siteSetting: {
    findUnique: (args: {
      where: { key: string };
    }) => Promise<{ value: unknown } | null>;
  };
};

/** Une env + SiteSetting `leads_spam` (panel admin). */
export async function loadSpamBlocklist(
  prisma: SettingReader,
  env: Record<string, string | undefined> = process.env,
) {
  const row = await prisma.siteSetting.findUnique({
    where: { key: LEADS_SPAM_SETTING_KEY },
  });
  return mergeSpamBlocklists(
    spamBlocklistFromEnv(env),
    parseSpamBlocklist(row?.value),
  );
}

/** Añade un contacto a la lista del panel (no toca variables de entorno). */
export function addContactToSpamBlocklist(
  current: SpamBlocklist,
  input: { email?: string | null; phone?: string | null },
) {
  const next = {
    emails: [...current.emails],
    domains: [...current.domains],
    phones: [...current.phones],
  };
  const email = input.email?.trim().toLowerCase();
  if (email) next.emails.push(email);
  const phone = normalizePhone(input.phone);
  if (phone) next.phones.push(phone);
  return {
    emails: uniq(next.emails),
    domains: uniq(next.domains),
    phones: uniq(next.phones),
  };
}
