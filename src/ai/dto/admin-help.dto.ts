import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminHelpDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  currentPage?: string;
}
