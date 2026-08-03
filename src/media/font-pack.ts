/** Utilidades para ZIP de Google Fonts → caras tipográficas. */

export type ParsedFontEntry = {
  entryName: string;
  basename: string;
  ext: string;
  weight: number;
  style: 'normal' | 'italic';
  priority: number;
  buffer: Buffer;
  variable?: boolean;
};

const FONT_EXTS = new Set(['.woff2', '.woff', '.ttf', '.otf']);

export const FONT_MIME: Record<string, string> = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

const EXT_PRIORITY: Record<string, number> = {
  '.woff2': 0,
  '.woff': 1,
  '.ttf': 2,
  '.otf': 3,
};

export function isFontPath(name: string): boolean {
  const lower = name.toLowerCase().replace(/\\/g, '/')
  if (lower.endsWith('/')) return false
  const base = lower.split('/').pop() || ''
  if (base.startsWith('.') || base === 'license.txt' || base === 'readme.txt') {
    return false
  }
  const dot = base.lastIndexOf('.')
  if (dot < 0) return false
  return FONT_EXTS.has(base.slice(dot))
}

export function inferWeightAndStyle(filename: string): {
  weight: number
  style: 'normal' | 'italic'
} {
  const n = filename.toLowerCase()
  const style: 'normal' | 'italic' =
    /italic|oblique/.test(n) && !/non.?italic/.test(n) ? 'italic' : 'normal'

  let weight = 400
  if (/thin|hairline/.test(n)) weight = 100
  else if (/extra.?light|ultra.?light/.test(n)) weight = 200
  else if (/(^|[-_ ])light([-_ .]|$)/.test(n)) weight = 300
  else if (/medium/.test(n)) weight = 500
  else if (/semi.?bold|demi.?bold/.test(n)) weight = 600
  else if (/extra.?bold|ultra.?bold/.test(n)) weight = 800
  else if (/(^|[-_ ])bold([-_ .]|$)/.test(n)) weight = 700
  else if (/black|heavy/.test(n)) weight = 900
  else if (/regular|normal|book|roman|text/.test(n)) weight = 400
  else if (/variable|wght/.test(n)) weight = 400

  return { weight, style }
}

export function faceKey(weight: number, style: string, variable: boolean) {
  return variable ? `var:${style}` : `${weight}:${style}`
}

export function isVariableFontName(name: string) {
  const n = name.toLowerCase()
  return n.includes('variable') || /\[.*wght.*\]/.test(n) || n.includes('_wght')
}

/**
 * Elige las mejores caras: preferir `static/` si existe;
 * preferir woff2 > woff > ttf; una por peso+estilo (o variable).
 */
export function selectBestFaces(
  entries: Array<{
    entryName: string
    buffer: Buffer
  }>,
): ParsedFontEntry[] {
  const fonts = entries
    .filter((e) => isFontPath(e.entryName))
    .map((e) => {
      const normalized = e.entryName.replace(/\\/g, '/')
      const base = normalized.split('/').pop() || normalized
      const ext = base.includes('.')
        ? base.slice(base.lastIndexOf('.')).toLowerCase()
        : ''
      const { weight, style } = inferWeightAndStyle(base)
      return {
        entryName: normalized,
        basename: base,
        ext,
        weight,
        style,
        priority: EXT_PRIORITY[ext] ?? 9,
        buffer: e.buffer,
        variable: isVariableFontName(base),
        inStatic: /\/static\//i.test(normalized),
      }
    })

  if (fonts.length === 0) return []

  const hasStatic = fonts.some((f) => f.inStatic)
  const pool = hasStatic ? fonts.filter((f) => f.inStatic) : fonts

  const best = new Map<string, (typeof pool)[number]>()
  for (const f of pool) {
    const key = faceKey(f.weight, f.style, f.variable)
    const prev = best.get(key)
    if (!prev || f.priority < prev.priority) best.set(key, f)
  }

  return [...best.values()]
    .sort((a, b) => a.weight - b.weight || a.style.localeCompare(b.style))
    .map(
      ({
        entryName,
        basename,
        ext,
        weight,
        style,
        priority,
        buffer,
        variable,
      }) => ({
        entryName,
        basename,
        ext,
        weight,
        style,
        priority,
        buffer,
        variable,
      }),
    )
}

export function guessFamilyName(entryNames: string[]): string {
  for (const name of entryNames) {
    const parts = name.replace(/\\/g, '/').split('/').filter(Boolean)
    // carpeta típica Google Fonts: FamilyName/archivo
    if (parts.length >= 2) {
      const folder = parts[parts.length - 2]
      if (
        folder &&
        !['static', 'desktop', 'web', 'ofl', 'apache', 'ufl'].includes(
          folder.toLowerCase(),
        )
      ) {
        return folder.replace(/[-_]+/g, ' ')
      }
    }
  }
  const first = entryNames[0]?.replace(/\\/g, '/').split('/').pop() || 'Custom'
  return first
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]?variable.*/i, '')
    .replace(/[-_]?(thin|light|regular|medium|bold|black|italic).*/i, '')
    .replace(/[-_]+/g, ' ')
    .trim() || 'Custom'
}
