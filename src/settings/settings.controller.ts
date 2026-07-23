import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../auth/permissions.guard';
import { SettingsService } from './settings.service';

@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('settings')
  getPublic() {
    return this.settings.getPublic();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('settings.write')
  @Get('admin/settings')
  listAdmin() {
    return this.settings.listAdmin();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('settings.write')
  @Put('admin/settings')
  upsert(@Body() body: { key: string; value: unknown }) {
    return this.settings.upsert(body.key, body.value);
  }
}
