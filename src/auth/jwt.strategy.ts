import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { PrismaService } from '../prisma/prisma.service'
import { permissionsForRoleDef } from './permissions'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev',
    })
  }

  async validate(payload: { sub: string }) {
    const user = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      include: { roleDef: true },
    })
    if (!user?.roleDef) throw new UnauthorizedException()
    const permissions = permissionsForRoleDef(user.roleDef)
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      roleSlug: user.roleDef.slug,
      roleName: user.roleDef.name,
      /** Compat: slug del rol (antes era el enum). */
      role: user.roleDef.slug,
      permissions,
    }
  }
}
