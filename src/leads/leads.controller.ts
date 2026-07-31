import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
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
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  create(@Body() dto: CreateLeadDto) {
    return this.leads.create(dto);
  }

  /** Consulta pública de estado PQRS por código (sin datos sensibles). */
  @Get('leads/pqrs/:trackingCode')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  pqrsStatus(@Param('trackingCode') trackingCode: string) {
    return this.leads.pqrsPublicStatus(trackingCode);
  }

  @Get('fleet/public/types')
  listFleetTypes() {
    return this.leads.listFleetTypes();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('leads.read')
  @Get('admin/leads')
  list(@Query('kind') kind?: string) {
    return this.leads.list(kind);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('leads.write')
  @Patch('admin/leads/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string; blockContact?: boolean },
  ) {
    return this.leads.updateStatus(id, body.status, {
      blockContact: body.blockContact === true,
    });
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('leads.read')
  @Get('admin/leads/spam-blocklist')
  getSpamBlocklist() {
    return this.leads.getSpamBlocklist();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('leads.write')
  @Put('admin/leads/spam-blocklist')
  setSpamBlocklist(
    @Body()
    body: { emails?: string[]; domains?: string[]; phones?: string[] },
  ) {
    return this.leads.setSpamBlocklist(body);
  }
}
