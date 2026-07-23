import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../auth/permissions.guard';
import { SetPublishStatusDto } from '../common/dto/set-publish-status.dto';
import { UpsertPageDto } from './dto/upsert-page.dto';
import { PagesService } from './pages.service';

@Controller()
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Get('pages/:slug')
  bySlug(@Param('slug') slug: string) {
    return this.pages.bySlug(slug);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('pages.read')
  @Get('admin/pages')
  listAdmin() {
    return this.pages.listAdmin();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('pages.read')
  @Get('admin/pages/:id')
  byId(@Param('id') id: string) {
    return this.pages.byId(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('pages.write')
  @Post('admin/pages')
  create(@Body() dto: UpsertPageDto) {
    return this.pages.create(dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('pages.write')
  @Patch('admin/pages/:id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetPublishStatusDto) {
    return this.pages.setStatus(id, dto.status);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('pages.write')
  @Patch('admin/pages/:id')
  update(@Param('id') id: string, @Body() dto: UpsertPageDto) {
    return this.pages.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('pages.write')
  @Delete('admin/pages/:id')
  remove(@Param('id') id: string) {
    return this.pages.remove(id);
  }
}
