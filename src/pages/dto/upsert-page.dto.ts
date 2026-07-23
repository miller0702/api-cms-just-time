import {
  Allow,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PublishStatus } from '@prisma/client';

export class PageBlockDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  type!: string;

  @IsInt()
  sortOrder!: number;

  @Allow()
  payload!: Record<string, unknown>;
}

export class UpsertPageDto {
  @IsString()
  @MinLength(1)
  slug!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  seoDescription?: string | null;

  @IsEnum(PublishStatus)
  status!: PublishStatus;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PageBlockDto)
  blocks!: PageBlockDto[];
}
