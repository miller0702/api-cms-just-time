import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PublishStatus, ServiceLine } from '@prisma/client';

export class ServiceGalleryItemDto {
  @IsString()
  id!: string;

  @IsString()
  mediaId!: string;

  @IsString()
  url!: string;

  @IsOptional()
  @IsString()
  mimeType?: string | null;

  @IsOptional()
  @IsString()
  alt?: string | null;

  @IsOptional()
  @IsString()
  caption?: string | null;

  @IsString()
  size!: 'sm' | 'md' | 'lg' | 'full';

  @IsInt()
  sortOrder!: number;
}

export class UpsertServiceDto {
  @IsEnum(ServiceLine)
  line!: ServiceLine;

  @IsString()
  @MinLength(2)
  slug!: string;

  @IsString()
  title!: string;

  @IsString()
  summary!: string;

  @IsString()
  body!: string;

  @IsArray()
  @IsString({ each: true })
  tags!: string[];

  @IsInt()
  sortOrder!: number;

  @IsOptional()
  @IsString()
  mediaId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceGalleryItemDto)
  gallery?: ServiceGalleryItemDto[];

  @IsEnum(PublishStatus)
  status!: PublishStatus;
}
