import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TrackPageViewDto {
  @IsString()
  @MaxLength(500)
  path!: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  referrer?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  sessionId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  visitorId?: string;
}
