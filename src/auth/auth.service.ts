import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../prisma/prisma.service'
import { permissionsForRoleDef } from './permissions'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: { email: string; password: string }) {
    const user = await this.prisma.adminUser.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { roleDef: true },
    })
    if (!user?.roleDef) throw new UnauthorizedException('Credenciales inválidas')
    const ok = await bcrypt.compare(dto.password, user.passwordHash)
    if (!ok) throw new UnauthorizedException('Credenciales inválidas')

    const permissions = permissionsForRoleDef(user.roleDef)
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      role: user.roleDef.slug,
      permissions,
    })
    return {
      accessToken,
      expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
      user: this.toPublicUser(user),
    }
  }

  async me(userId: string) {
    const user = await this.prisma.adminUser.findUnique({
      where: { id: userId },
      include: { roleDef: true },
    })
    if (!user?.roleDef) throw new UnauthorizedException()
    return this.toPublicUser(user)
  }

  private toPublicUser(
    user: {
      id: string
      email: string
      name: string
      roleId: string
      roleDef: {
        slug: string
        name: string
        permissions: string[]
      }
    },
  ) {
    const permissions = permissionsForRoleDef(user.roleDef)
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      roleSlug: user.roleDef.slug,
      roleName: user.roleDef.name,
      role: user.roleDef.slug,
      permissions,
    }
  }
}
