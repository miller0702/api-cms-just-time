import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('admin/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Custom token Firebase para que el CMS lea Firestore con auth. */
  @UseGuards(JwtAuthGuard)
  @Post('session')
  session(@Req() req: Request & { user: { userId: string } }) {
    return this.notifications.createCustomToken(req.user.userId);
  }
}
