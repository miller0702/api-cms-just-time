import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ServicesContentService } from './services-content.service';
import { ServicesContentController } from './services-content.controller';

@Module({
  imports: [AuthModule],
  providers: [ServicesContentService],
  controllers: [ServicesContentController],
})
export class ServicesContentModule {}
