import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../prisma/prisma.service'
import {
  permissionsForRoleDef,
  userHasPermission,
} from '../auth/permissions'
import type { ActorCtx } from '../roles/roles.service'
import { RolesService } from '../roles/roles.service'
import { CreateAdminUserDto, UpdateAdminUserDto } from './dto/upsert-user.dto'

const publicSelect = {
  id: true,
  email: true,
  name: true,
  roleId: true,
  createdAt: true,
  updatedAt: true,
  roleDef: {
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      isSystem: true,
      permissions: true,
    },
  },
} as const

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
  ) {}

  list() {
    return this.prisma.adminUser.findMany({
      select: publicSelect,
      orderBy: [{ name: 'asc' }],
    })
  }

  async byId(id: string) {
    const user = await this.prisma.adminUser.findUnique({
      where: { id },
      select: publicSelect,
    })
    if (!user) throw new NotFoundException('Usuario no encontrado')
    return user
  }

  async create(actor: ActorCtx, dto: CreateAdminUserDto) {
    await this.roles.assertCanAssignRoleId(actor, dto.roleId)
    const email = dto.email.toLowerCase().trim()
    const exists = await this.prisma.adminUser.findUnique({ where: { email } })
    if (exists) throw new ConflictException('Ya existe un usuario con ese email')

    return this.prisma.adminUser.create({
      data: {
        email,
        name: dto.name.trim(),
        roleId: dto.roleId,
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
      select: publicSelect,
    })
  }

  async update(actor: ActorCtx, id: string, dto: UpdateAdminUserDto) {
    const current = await this.byId(id)
    const currentPerms = permissionsForRoleDef(current.roleDef)

    if (!this.roles.canAssignRole(actor, currentPerms, current.roleDef.slug)) {
      throw new ForbiddenException('No puedes editar este usuario')
    }

    const nextRoleId = dto.roleId ?? current.roleId
    if (dto.roleId) {
      await this.roles.assertCanAssignRoleId(actor, dto.roleId)
    }

    const nextRole = await this.roles.byId(nextRoleId)
    const nextPerms = permissionsForRoleDef(nextRole)

    if (current.roleDef.slug === 'superadmin' && nextRole.slug !== 'superadmin') {
      await this.ensureNotLastSuperadmin(id)
    }

    // Evitar auto-quitar el último acceso a users.manage
    if (
      actor.userId === id &&
      userHasPermission(currentPerms, 'users.manage') &&
      !userHasPermission(nextPerms, 'users.manage')
    ) {
      await this.ensureNotLastUsersManage(id)
    }

    const email = dto.email?.toLowerCase().trim()
    if (email && email !== current.email) {
      const taken = await this.prisma.adminUser.findUnique({ where: { email } })
      if (taken) throw new ConflictException('Ya existe un usuario con ese email')
    }

    return this.prisma.adminUser.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(email ? { email } : {}),
        ...(dto.roleId ? { roleId: dto.roleId } : {}),
        ...(dto.password
          ? { passwordHash: await bcrypt.hash(dto.password, 10) }
          : {}),
      },
      select: publicSelect,
    })
  }

  async remove(actor: ActorCtx, id: string) {
    if (actor.userId === id) {
      throw new BadRequestException('No puedes eliminar tu propia cuenta')
    }
    const current = await this.byId(id)
    if (!this.roles.canAssignRole(actor, permissionsForRoleDef(current.roleDef), current.roleDef.slug)) {
      throw new ForbiddenException('No puedes eliminar este usuario')
    }
    if (current.roleDef.slug === 'superadmin') {
      await this.ensureNotLastSuperadmin(id)
    }
    await this.prisma.adminUser.delete({ where: { id } })
    return { ok: true }
  }

  private async ensureNotLastSuperadmin(id: string) {
    const count = await this.prisma.adminUser.count({
      where: { roleDef: { slug: 'superadmin' } },
    })
    if (count <= 1) {
      throw new BadRequestException(
        'Debe existir al menos un superadmin en el sistema',
      )
    }
    void id
  }

  private async ensureNotLastUsersManage(id: string) {
    const holders = await this.prisma.adminUser.count({
      where: {
        id: { not: id },
        roleDef: { permissions: { has: 'users.manage' } },
      },
    })
    // También cuentan superadmins (permisos forzados)
    const otherSuper = await this.prisma.adminUser.count({
      where: {
        id: { not: id },
        roleDef: { slug: 'superadmin' },
      },
    })
    if (holders + otherSuper <= 0) {
      throw new BadRequestException(
        'Debe quedar al menos un usuario que pueda gestionar cuentas',
      )
    }
  }
}
