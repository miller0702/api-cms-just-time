export type Permission =
  | 'dashboard.view'
  | 'news.read'
  | 'news.write'
  | 'pills.read'
  | 'pills.write'
  | 'pages.read'
  | 'pages.write'
  | 'services.read'
  | 'services.write'
  | 'projects.read'
  | 'projects.write'
  | 'media.read'
  | 'media.write'
  | 'leads.read'
  | 'leads.write'
  | 'comments.read'
  | 'comments.moderate'
  | 'settings.write'
  | 'users.manage'

export type PermissionGroup =
  | 'General'
  | 'Noticias'
  | 'Píldoras'
  | 'Páginas'
  | 'Servicios'
  | 'Proyectos'
  | 'Media'
  | 'Cotizaciones'
  | 'Comentarios'
  | 'Ajustes'
  | 'Usuarios'

export const ALL_PERMISSIONS: Permission[] = [
  'dashboard.view',
  'news.read',
  'news.write',
  'pills.read',
  'pills.write',
  'pages.read',
  'pages.write',
  'services.read',
  'services.write',
  'projects.read',
  'projects.write',
  'media.read',
  'media.write',
  'leads.read',
  'leads.write',
  'comments.read',
  'comments.moderate',
  'settings.write',
  'users.manage',
]

export const PERMISSION_CATALOG: Array<{
  id: Permission
  label: string
  group: PermissionGroup
}> = [
  { id: 'dashboard.view', label: 'Ver dashboard', group: 'General' },
  { id: 'news.read', label: 'Ver noticias', group: 'Noticias' },
  { id: 'news.write', label: 'Crear y editar noticias', group: 'Noticias' },
  { id: 'pills.read', label: 'Ver píldoras', group: 'Píldoras' },
  { id: 'pills.write', label: 'Crear y editar píldoras', group: 'Píldoras' },
  { id: 'pages.read', label: 'Ver páginas', group: 'Páginas' },
  { id: 'pages.write', label: 'Crear y editar páginas', group: 'Páginas' },
  { id: 'services.read', label: 'Ver servicios', group: 'Servicios' },
  { id: 'services.write', label: 'Crear y editar servicios', group: 'Servicios' },
  { id: 'projects.read', label: 'Ver proyectos', group: 'Proyectos' },
  { id: 'projects.write', label: 'Crear y editar proyectos', group: 'Proyectos' },
  { id: 'media.read', label: 'Ver media', group: 'Media' },
  { id: 'media.write', label: 'Subir y gestionar media', group: 'Media' },
  { id: 'leads.read', label: 'Ver cotizaciones', group: 'Cotizaciones' },
  { id: 'leads.write', label: 'Gestionar cotizaciones', group: 'Cotizaciones' },
  { id: 'comments.read', label: 'Ver comentarios', group: 'Comentarios' },
  { id: 'comments.moderate', label: 'Moderar comentarios', group: 'Comentarios' },
  { id: 'settings.write', label: 'Personalizar el sitio', group: 'Ajustes' },
  { id: 'users.manage', label: 'Gestionar usuarios y roles', group: 'Usuarios' },
]

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS)

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value)
}

export function sanitizePermissions(values: string[] | null | undefined): Permission[] {
  if (!values?.length) return []
  const seen = new Set<Permission>()
  for (const value of values) {
    if (isPermission(value)) seen.add(value)
  }
  return ALL_PERMISSIONS.filter((p) => seen.has(p))
}

/** Superadmin siempre tiene todos los permisos. */
export function permissionsForRoleDef(role: {
  slug: string
  permissions: string[]
}): Permission[] {
  if (role.slug === 'superadmin') return [...ALL_PERMISSIONS]
  return sanitizePermissions(role.permissions)
}

export function userHasPermission(
  permissions: string[] | null | undefined,
  permission: Permission,
): boolean {
  return Boolean(permissions?.includes(permission))
}

/** ¿Puede el actor otorgar estos permisos? (subconjunto). */
export function isPermissionsSubset(
  actorPermissions: string[],
  targetPermissions: string[],
): boolean {
  const actor = new Set(actorPermissions)
  return targetPermissions.every((p) => actor.has(p))
}

export type SystemRoleSeed = {
  slug: string
  name: string
  description: string
  permissions: Permission[]
}

export function systemRoleSeeds(): SystemRoleSeed[] {
  const editor = ALL_PERMISSIONS.filter(
    (p) => p !== 'settings.write' && p !== 'users.manage',
  )
  const viewer: Permission[] = [
    'dashboard.view',
    'news.read',
    'pills.read',
    'pages.read',
    'services.read',
    'projects.read',
    'media.read',
    'leads.read',
    'comments.read',
  ]
  return [
    {
      slug: 'superadmin',
      name: 'Superadmin',
      description: 'Control total del sistema, incluido gestionar administradores.',
      permissions: [...ALL_PERMISSIONS],
    },
    {
      slug: 'admin',
      name: 'Administrador',
      description: 'Operación del sitio, ajustes y gestión de usuarios.',
      permissions: [...ALL_PERMISSIONS],
    },
    {
      slug: 'editor',
      name: 'Editor',
      description: 'Crear y editar contenido, media, cotizaciones y comentarios.',
      permissions: editor,
    },
    {
      slug: 'viewer',
      name: 'Solo lectura',
      description: 'Solo consultar el panel, sin cambios.',
      permissions: viewer,
    },
  ]
}

export function slugifyRoleName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'rol'
}
