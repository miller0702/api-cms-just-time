import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { PublishStatus } from '@prisma/client';

export class UpsertPillDto {
  @IsString()
  @MinLength(2)
  slug!: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  summary!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  category?: string | null;

  @IsOptional()
  @IsString()
  coverMediaId?: string | null;

  @IsEnum(PublishStatus)
  status!: PublishStatus;
}
