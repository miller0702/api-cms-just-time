import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../auth/permissions.guard';
import { MediaService } from './media.service';

const useGcs = Boolean(process.env.GCS_BUCKET?.trim());

@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('media.read')
  @Get('admin/media/folders')
  listFolders(
    @Query('parentId') parentId?: string,
    @Query('recent') recent?: string,
  ) {
    if (recent != null && recent !== '0' && recent !== 'false') {
      const limit = Number(recent);
      return this.media.recentFolders(Number.isFinite(limit) ? limit : 12);
    }
    if (parentId === 'all') return this.media.listAllFolders();
    return this.media.listFolders(parentId || null);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('media.write')
  @Post('admin/media/folders')
  createFolder(@Body() body: { name: string; parentId?: string | null }) {
    return this.media.createFolder(body.name, body.parentId);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('media.write')
  @Post('admin/media/folders/ensure')
  ensurePath(@Body() body: { path: string[] }) {
    return this.media.ensurePath(body.path || []);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('media.write')
  @Patch('admin/media/folders/:id')
  renameFolder(@Param('id') id: string, @Body() body: { name: string }) {
    return this.media.renameFolder(id, body.name);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('media.write')
  @Delete('admin/media/folders/:id')
  removeFolder(@Param('id') id: string) {
    return this.media.removeFolder(id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('media.read')
  @Get('admin/media')
  list(
    @Query('folderId') folderId?: string,
    @Query('kind')
    kind?: 'image' | 'video' | 'audio' | 'document' | 'all',
  ) {
    const resolved =
      folderId === undefined
        ? undefined
        : folderId === 'root' || folderId === ''
          ? null
          : folderId;
    return this.media.list(resolved, kind || 'all');
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('media.write')
  @Post('admin/media')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: useGcs
        ? memoryStorage()
        : diskStorage({
            destination: join(process.cwd(), 'uploads'),
            filename: (_req, file, cb) => {
              cb(null, `${randomUUID()}${extname(file.originalname)}`);
            },
          }),
      limits: { fileSize: 200 * 1024 * 1024 },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('alt') alt?: string,
    @Body('folderId') folderId?: string,
    @Body('filename') filename?: string,
  ) {
    return this.media.saveFile(file, alt, folderId || null, filename);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('media.write')
  @Patch('admin/media/:id')
  move(
    @Param('id') id: string,
    @Body() body: { folderId?: string | null },
  ) {
    return this.media.moveAsset(id, body.folderId ?? null);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('media.write')
  @Delete('admin/media/:id')
  remove(@Param('id') id: string) {
    return this.media.remove(id);
  }
}
