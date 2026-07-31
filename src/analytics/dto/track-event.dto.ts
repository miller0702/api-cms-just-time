import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class TrackEventDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  category?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  label?: string;

  @IsInt()
  @IsOptional()
  value?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  path?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  sessionId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  visitorId?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
