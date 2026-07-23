import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

const BUSINESS_LINES = ['hidrocarburos', 'urbanismo', 'proyectos'] as const;

export class CreateLeadDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsString()
  @MinLength(5)
  message!: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsIn(BUSINESS_LINES)
  businessLine?: (typeof BUSINESS_LINES)[number];

  @IsOptional()
  @IsString()
  serviceSlug?: string;

  @IsOptional()
  @IsString()
  projectSlug?: string;

  @IsOptional()
  @IsString()
  lotCode?: string;
}
