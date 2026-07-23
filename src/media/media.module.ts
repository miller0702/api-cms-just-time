import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { ObjectStorageService } from './object-storage.service';

@Module({
  imports: [AuthModule],
  providers: [ObjectStorageService, MediaService],
  controllers: [MediaController],
  exports: [MediaService, ObjectStorageService],
})
export class MediaModule {}
