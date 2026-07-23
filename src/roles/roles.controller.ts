import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  PermissionsGuard,
  RequirePermissions,
} from '../auth/permissions.guard'
import { CreateRoleDto, UpdateRoleDto } from './dto/upsert-role.dto'
import { RolesService, type ActorCtx } from './roles.service'

type AuthRequest = Request & {
  user: ActorCtx
}

@Controller()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.manage')
  @Get('admin/roles/permissions')
  catalog() {
    return this.roles.catalog()
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.manage')
  @Get('admin/roles')
  list(@Req() req: AuthRequest) {
    return this.roles.listAssignable(req.user)
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.manage')
  @Get('admin/roles/:id')
  byId(@Param('id') id: string) {
    return this.roles.byId(id)
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.manage')
  @Post('admin/roles')
  create(@Req() req: AuthRequest, @Body() dto: CreateRoleDto) {
    return this.roles.create(req.user, dto)
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.manage')
  @Patch('admin/roles/:id')
  update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.roles.update(req.user, id, dto)
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.manage')
  @Delete('admin/roles/:id')
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.roles.remove(req.user, id)
  }
}
