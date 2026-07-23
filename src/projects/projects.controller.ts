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
