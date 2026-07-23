import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  ALL_PERMISSIONS,
  PERMISSION_CATALOG,
  isPermissionsSubset,
  permissionsForRoleDef,
  sanitizePermissions,
  slugifyRoleName,
  systemRoleSeeds,
  type Permission,
} from '../auth/permissions'
import { CreateRoleDto, UpdateRoleDto } from './dto/upsert-role.dto'

export type ActorCtx = {
  userId: string
  roleId: string
  roleSlug: string
  permissions: string[]
}

const publicSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  isSystem: true,
  permissions: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { users: true } },
} as const

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Asegura roles de sistema (idempotente). */
  async ensureSystemRoles() {
    for (const seed of systemRoleSeeds()) {
      const existing = await this.prisma.adminRoleDef.findUnique({
        where: { slug: seed.slug },
      })
      if (!existing) {
        await this.prisma.adminRoleDef.create({
          data: {
            slug: seed.slug,
            name: seed.name,
            description: seed.description,
            isSystem: true,
            permissions: seed.permissions,
          },
        })
        continue
      }
      // Mantén superadmin siempre con todos los permisos
      if (seed.slug === 'superadmin') {
        await this.prisma.adminRoleDef.update({
          where: { id: existing.id },
          data: { permissions: [...ALL_PERMISSIONS], isSystem: true },
        })
      }
    }
  }

  async getBySlug(slug: string) {
    return this.prisma.adminRoleDef.findUnique({ where: { slug } })
  }

  catalog() {
    return {
      permissions: PERMISSION_CATALOG,
      all: ALL_PERMISSIONS,
    }
  }

  list() {
    return this.prisma.adminRoleDef.findMany({
      select: publicSelect,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    })
  }

  /** Roles que el actor puede asignar a usuarios. */
  async listAssignable(actor: ActorCtx) {
    const roles = await this.list()
    return roles.filter((role) =>
      this.canAssignRole(actor, permissionsForRoleDef(role), role.slug),
    )
  }

  async byId(id: string) {
    const role = await this.prisma.adminRoleDef.findUnique({
      where: { id },
      select: publicSelect,
    })
    if (!role) throw new NotFoundException('Rol no encontrado')
    return role
  }

  canAssignRole(
    actor: ActorCtx,
    targetPermissions: Permission[],
    targetSlug?: string,
  ) {
    if (targetSlug === 'superadmin' && actor.roleSlug !== 'superadmin') {
      return false
    }
    if (actor.roleSlug === 'superadmin') return true
    return isPermissionsSubset(actor.permissions, targetPermissions)
  }

  async assertCanAssignRoleId(actor: ActorCtx, roleId: string) {
    const role = await this.byId(roleId)
    const perms = permissionsForRoleDef(role)
    if (!this.canAssignRole(actor, perms, role.slug)) {
      throw new ForbiddenException('No puedes asignar ese rol')
    }
    return role
  }

  async create(actor: ActorCtx, dto: CreateRoleDto) {
    const permissions = sanitizePermissions(dto.permissions)
    if (!this.canAssignRole(actor, permissions)) {
      throw new ForbiddenException(
        'No puedes crear un rol con permisos superiores a los tuyos',
      )
    }
    const name = dto.name.trim()
    let slug = slugifyRoleName(name)
    const reserved = new Set(systemRoleSeeds().map((r) => r.slug))
    if (reserved.has(slug)) slug = `${slug}-custom`

    const clash = await this.prisma.adminRoleDef.findUnique({ where: { slug } })
    if (clash) {
      slug = `${slug}-${Date.now().toString(36)}`
    }

    return this.prisma.adminRoleDef.create({
      data: {
        name,
        slug,
        description: dto.description?.trim() || null,
        isSystem: false,
        permissions,
      },
      select: publicSelect,
    })
  }

  async update(actor: ActorCtx, id: string, dto: UpdateRoleDto) {
    const current = await this.byId(id)

    if (current.slug === 'superadmin') {
      if (dto.permissions) {
        throw new BadRequestException(
          'Los permisos del superadmin no se pueden modificar',
        )
      }
      // Solo nombre/descripción cosméticos
      return this.prisma.adminRoleDef.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
        },
        select: publicSelect,
      })
    }

    const nextPermissions =
      dto.permissions !== undefined
        ? sanitizePermissions(dto.permissions)
        : permissionsForRoleDef(current)

    if (!this.canAssignRole(actor, nextPermissions, current.slug)) {
      throw new ForbiddenException(
        'No puedes asignar permisos superiores a los tuyos',
      )
    }

    // Si el actor no es superadmin, solo puede editar roles que ya podía asignar
    if (!this.canAssignRole(actor, permissionsForRoleDef(current), current.slug)) {
      throw new ForbiddenException('No puedes editar este rol')
    }

    return this.prisma.adminRoleDef.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.permissions !== undefined
          ? { permissions: nextPermissions }
          : {}),
      },
      select: publicSelect,
    })
  }

  async remove(actor: ActorCtx, id: string) {
    const current = await this.byId(id)
    if (current.isSystem) {
      throw new BadRequestException('No se pueden eliminar roles del sistema')
    }
    if (!this.canAssignRole(actor, permissionsForRoleDef(current), current.slug)) {
      throw new ForbiddenException('No puedes eliminar este rol')
    }
    if (current._count.users > 0) {
      throw new ConflictException(
        'Reasigna o elimina los usuarios de este rol antes de borrarlo',
      )
    }
    await this.prisma.adminRoleDef.delete({ where: { id } })
    return { ok: true }
  }
}
