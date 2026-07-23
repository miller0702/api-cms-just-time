import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PagesService } from './pages.service';
import { PagesController } from './pages.controller';

@Module({
  imports: [AuthModule],
  providers: [PagesService],
  controllers: [PagesController],
})
export class PagesModule {}
