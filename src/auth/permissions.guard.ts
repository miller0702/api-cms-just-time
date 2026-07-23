import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { userHasPermission, type Permission } from './permissions'

export const PERMISSIONS_KEY = 'permissions'
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions)

type AuthUser = {
  role?: string
  permissions?: string[]
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    )
    if (!required?.length) return true

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>()
    const permissions = req.user?.permissions || []
    const ok = required.every((p) => userHasPermission(permissions, p))
    if (!ok) {
      throw new ForbiddenException('No tienes permiso para esta acción')
    }
    return true
  }
}
