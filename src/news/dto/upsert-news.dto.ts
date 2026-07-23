import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { PublishStatus } from '@prisma/client';

export class UpsertNewsDto {
  @IsString()
  @MinLength(2)
  slug!: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  excerpt!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  coverMediaId?: string | null;

  @IsEnum(PublishStatus)
  status!: PublishStatus;
}
