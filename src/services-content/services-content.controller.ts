import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ServiceLine } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../auth/permissions.guard';
import { SetPublishStatusDto } from '../common/dto/set-publish-status.dto';
import { UpsertServiceDto } from './dto/upsert-service.dto';
import { ServicesContentService } from './services-content.service';

@Controller()
export class ServicesContentController {
  constructor(private readonly services: ServicesContentService) {}

  @Get('services')
  listPublic(@Query('line') line?: ServiceLine) {
    return this.services.listPublic(line);
  }

  @Get('services/:slug')
  bySlug(@Param('slug') slug: string) {
    return this.services.bySlug(slug);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('services.read')
  @Get('admin/services')
  listAdmin() {
    return this.services.listAdmin();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('services.read')
  @Get('admin/services/:id')
  byId(@Param('id') id: string) {
    return this.services.byId(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('services.write')
  @Post('admin/services')
  create(@Body() dto: UpsertServiceDto) {
    return this.services.create(dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('services.write')
  @Patch('admin/services/:id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetPublishStatusDto) {
    return this.services.setStatus(id, dto.status);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('services.write')
  @Patch('admin/services/:id')
  update(@Param('id') id: string, @Body() dto: UpsertServiceDto) {
    return this.services.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('services.write')
  @Delete('admin/services/:id')
  remove(@Param('id') id: string) {
    return this.services.remove(id);
  }
}
