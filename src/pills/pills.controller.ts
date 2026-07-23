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
import { UpsertPillDto } from './dto/upsert-pill.dto';
import { PillsService } from './pills.service';

@Controller()
export class PillsController {
  constructor(private readonly pills: PillsService) {}

  @Get('pills')
  listPublic() {
    return this.pills.listPublic();
  }

  @Get('pills/:slug')
  bySlug(@Param('slug') slug: string) {
    return this.pills.bySlug(slug);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('pills.read')
  @Get('admin/pills')
  listAdmin() {
    return this.pills.listAdmin();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('pills.read')
  @Get('admin/pills/:id')
  byId(@Param('id') id: string) {
    return this.pills.byId(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('pills.write')
  @Post('admin/pills')
  create(@Body() dto: UpsertPillDto) {
    return this.pills.create(dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('pills.write')
  @Patch('admin/pills/:id')
  update(@Param('id') id: string, @Body() dto: UpsertPillDto) {
    return this.pills.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('pills.write')
  @Delete('admin/pills/:id')
  remove(@Param('id') id: string) {
    return this.pills.remove(id);
  }
}
