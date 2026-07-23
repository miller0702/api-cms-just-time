import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NewsService } from './news.service';
import { NewsController } from './news.controller';

@Module({
  imports: [AuthModule],
  providers: [NewsService],
  controllers: [NewsController],
})
export class NewsModule {}
