import { IsEnum } from 'class-validator';
import { PublishStatus } from '@prisma/client';

export class SetPublishStatusDto {
  @IsEnum(PublishStatus)
  status!: PublishStatus;
}
