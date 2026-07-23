import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { PublishStatus } from '@prisma/client';

export class UpsertProjectDto {
  @IsString()
  @MinLength(2)
  slug!: string;

  @IsString()
  name!: string;

  @IsString()
  locationCity!: string;

  @IsString()
  locationDept!: string;

  @IsString()
  summary!: string;

  @IsString()
  body!: string;

  @IsArray()
  @IsString({ each: true })
  badges!: string[];

  @IsArray()
  @IsString({ each: true })
  tags!: string[];

  @IsNumber()
  priceFromCop!: number;

  @IsOptional()
  @IsString()
  erpProjectId?: string | null;

  @IsOptional()
  @IsString()
  coverMediaId?: string | null;

  @IsOptional()
  @IsString()
  logoMediaId?: string | null;

  @IsEnum(PublishStatus)
  status!: PublishStatus;
}
