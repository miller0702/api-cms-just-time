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
import type { ActorCtx } from '../roles/roles.service'
import { CreateAdminUserDto, UpdateAdminUserDto } from './dto/upsert-user.dto'
import { UsersService } from './users.service'

type AuthRequest = Request & {
  user: ActorCtx
}

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.manage')
  @Get('admin/users')
  list() {
    return this.users.list()
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.manage')
  @Get('admin/users/:id')
  byId(@Param('id') id: string) {
    return this.users.byId(id)
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.manage')
  @Post('admin/users')
  create(@Req() req: AuthRequest, @Body() dto: CreateAdminUserDto) {
    return this.users.create(req.user, dto)
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.manage')
  @Patch('admin/users/:id')
  update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.users.update(req.user, id, dto)
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.manage')
  @Delete('admin/users/:id')
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.users.remove(req.user, id)
  }
}
