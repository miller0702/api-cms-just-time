import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../auth/permissions.guard';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadsService } from './leads.service';

@Controller()
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post('leads')
  create(@Body() dto: CreateLeadDto) {
    return this.leads.create(dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('leads.read')
  @Get('admin/leads')
  list() {
    return this.leads.list();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('leads.write')
  @Patch('admin/leads/:id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.leads.updateStatus(id, status);
  }
}
