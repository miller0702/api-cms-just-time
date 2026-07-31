import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../auth/permissions.guard';
import { SetPublishStatusDto } from '../common/dto/set-publish-status.dto';
import { CreateLotInquiryDto } from './dto/create-lot-inquiry.dto';
import { UpsertProjectDto } from './dto/upsert-project.dto';
import { ProjectsService } from './projects.service';

@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('sale-projects')
  listPublic() {
    return this.projects.listPublic();
  }

  @Get('sale-projects/:slug')
  bySlug(@Param('slug') slug: string) {
    return this.projects.bySlug(slug);
  }

  /** Inventario público ERP (vía vínculo erpProjectId). */
  @Get('sale-projects/:slug/lots')
  erpLots(@Param('slug') slug: string) {
    return this.projects.getErpLots(slug);
  }

  /** Mapa SVG publicado en ERP. */
  @Get('sale-projects/:slug/map')
  erpMap(@Param('slug') slug: string) {
    return this.projects.getErpMap(slug);
  }

  /** Lead de lote → ERP LotInterest. */
  @Post('sale-projects/:slug/lots/:lotId/interests')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  lotInquiry(
    @Param('slug') slug: string,
    @Param('lotId') lotId: string,
    @Body() dto: CreateLotInquiryDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.projects.createLotInquiry(slug, lotId, dto, idempotencyKey);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('projects.read')
  @Get('admin/sale-projects')
  listAdmin() {
    return this.projects.listAdmin();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('projects.read')
  @Get('admin/sale-projects/:id')
  byId(@Param('id') id: string) {
    return this.projects.byId(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('projects.write')
  @Post('admin/sale-projects')
  create(@Body() dto: UpsertProjectDto) {
    return this.projects.create(dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('projects.write')
  @Patch('admin/sale-projects/:id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetPublishStatusDto) {
    return this.projects.setStatus(id, dto.status);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('projects.write')
  @Patch('admin/sale-projects/:id')
  update(@Param('id') id: string, @Body() dto: UpsertProjectDto) {
    return this.projects.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('projects.write')
  @Delete('admin/sale-projects/:id')
  remove(@Param('id') id: string) {
    return this.projects.remove(id);
  }
}
