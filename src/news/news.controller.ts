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
import { UpsertNewsDto } from './dto/upsert-news.dto';
import { NewsService } from './news.service';

@Controller()
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get('news')
  listPublic() {
    return this.news.listPublic();
  }

  @Get('news/:slug')
  bySlug(@Param('slug') slug: string) {
    return this.news.bySlug(slug);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('news.read')
  @Get('admin/news')
  listAdmin() {
    return this.news.listAdmin();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('news.read')
  @Get('admin/news/:id')
  byId(@Param('id') id: string) {
    return this.news.byId(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('news.write')
  @Post('admin/news')
  create(@Body() dto: UpsertNewsDto) {
    return this.news.create(dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('news.write')
  @Patch('admin/news/:id')
  update(@Param('id') id: string, @Body() dto: UpsertNewsDto) {
    return this.news.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('news.write')
  @Delete('admin/news/:id')
  remove(@Param('id') id: string) {
    return this.news.remove(id);
  }
}
