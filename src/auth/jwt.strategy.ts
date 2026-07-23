import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { PrismaService } from '../prisma/prisma.service'
import { permissionsForRoleDef } from './permissions'

type AuthUser = {
  userId: string
  email: string
  name: string
  roleId: string
  roleSlug: string
  roleName: string
  role: string
  permissions: string[]
}

const AUTH_CACHE_TTL_MS = 60_000

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly cache = new Map<string, { at: number; user: AuthUser }>()

  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'dev',
    })
  }

  async validate(payload: { sub: string }): Promise<AuthUser> {
    const hit = this.cache.get(payload.sub)
    if (hit && Date.now() - hit.at < AUTH_CACHE_TTL_MS) {
      return hit.user
    }

    const user = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      include: { roleDef: true },
    })
    if (!user?.roleDef) throw new UnauthorizedException()
    const permissions = permissionsForRoleDef(user.roleDef)
    const authUser: AuthUser = {
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
    this.cache.set(payload.sub, { at: Date.now(), user: authUser })
    return authUser
  }
}
