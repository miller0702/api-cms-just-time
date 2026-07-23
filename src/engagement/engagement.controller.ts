import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommentStatus, ContentType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../auth/permissions.guard';
import { EngagementService } from './engagement.service';

@Controller()
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Post('news/:slug/view')
  newsView(
    @Param('slug') slug: string,
    @Headers('x-visitor-key') visitorKey?: string,
    @Body('visitorKey') bodyKey?: string,
  ) {
    return this.engagement.trackView(
      ContentType.news,
      slug,
      visitorKey || bodyKey,
    );
  }

  @Post('pills/:slug/view')
  pillView(
    @Param('slug') slug: string,
    @Headers('x-visitor-key') visitorKey?: string,
    @Body('visitorKey') bodyKey?: string,
  ) {
    return this.engagement.trackView(
      ContentType.pill,
      slug,
      visitorKey || bodyKey,
    );
  }

  @Post('news/:slug/like')
  newsLike(
    @Param('slug') slug: string,
    @Headers('x-visitor-key') visitorKey?: string,
    @Body('visitorKey') bodyKey?: string,
  ) {
    return this.engagement.toggleLike(
      ContentType.news,
      slug,
      visitorKey || bodyKey || '',
    );
  }

  @Post('pills/:slug/like')
  pillLike(
    @Param('slug') slug: string,
    @Headers('x-visitor-key') visitorKey?: string,
    @Body('visitorKey') bodyKey?: string,
  ) {
    return this.engagement.toggleLike(
      ContentType.pill,
      slug,
      visitorKey || bodyKey || '',
    );
  }

  @Get('news/:slug/like')
  newsLiked(
    @Param('slug') slug: string,
    @Headers('x-visitor-key') visitorKey?: string,
    @Query('visitorKey') qKey?: string,
  ) {
    return this.engagement.likedByVisitor(
      ContentType.news,
      slug,
      visitorKey || qKey,
    );
  }

  @Get('pills/:slug/like')
  pillLiked(
    @Param('slug') slug: string,
    @Headers('x-visitor-key') visitorKey?: string,
    @Query('visitorKey') qKey?: string,
  ) {
    return this.engagement.likedByVisitor(
      ContentType.pill,
      slug,
      visitorKey || qKey,
    );
  }

  @Post('news/:slug/share')
  newsShare(
    @Param('slug') slug: string,
    @Body() body: { channel?: string; visitorKey?: string },
    @Headers('x-visitor-key') visitorKey?: string,
  ) {
    return this.engagement.trackShare(
      ContentType.news,
      slug,
      body.channel,
      visitorKey || body.visitorKey,
    );
  }

  @Post('pills/:slug/share')
  pillShare(
    @Param('slug') slug: string,
    @Body() body: { channel?: string; visitorKey?: string },
    @Headers('x-visitor-key') visitorKey?: string,
  ) {
    return this.engagement.trackShare(
      ContentType.pill,
      slug,
      body.channel,
      visitorKey || body.visitorKey,
    );
  }

  @Get('news/:slug/comments')
  newsComments(@Param('slug') slug: string) {
    return this.engagement.listComments(ContentType.news, slug);
  }

  @Get('pills/:slug/comments')
  pillComments(@Param('slug') slug: string) {
    return this.engagement.listComments(ContentType.pill, slug);
  }

  @Post('news/:slug/comments')
  newsCreateComment(
    @Param('slug') slug: string,
    @Body() body: { authorName: string; authorEmail?: string; body: string },
  ) {
    return this.engagement.createComment(ContentType.news, slug, body);
  }

  @Post('pills/:slug/comments')
  pillCreateComment(
    @Param('slug') slug: string,
    @Body() body: { authorName: string; authorEmail?: string; body: string },
  ) {
    return this.engagement.createComment(ContentType.pill, slug, body);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('comments.read')
  @Get('admin/comments')
  adminComments(
    @Query('status') status?: CommentStatus,
    @Query('contentType') contentType?: ContentType,
    @Query('contentId') contentId?: string,
  ) {
    return this.engagement.listAdminComments(status, contentType, contentId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('comments.moderate')
  @Patch('admin/comments/:id')
  moderate(
    @Param('id') id: string,
    @Body() body: { status: CommentStatus },
  ) {
    return this.engagement.moderateComment(id, body.status);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('comments.moderate')
  @Delete('admin/comments/:id')
  remove(@Param('id') id: string) {
    return this.engagement.deleteComment(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('dashboard.view')
  @Get('admin/stats')
  stats() {
    return this.engagement.adminStats();
  }
}
