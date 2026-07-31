import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

const BUSINESS_LINES = ['hidrocarburos', 'urbanismo', 'proyectos'] as const;
const LEAD_KINDS = [
  'contact',
  'pqrs',
  'fleet',
  'fleet_availability',
  'lot_inquiry',
] as const;
const PQRS_TYPES = [
  'peticion',
  'queja',
  'reclamo',
  'sugerencia',
  'felicitacion',
] as const;

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
  @IsIn(LEAD_KINDS)
  kind?: (typeof LEAD_KINDS)[number];

  @IsOptional()
  @IsIn(PQRS_TYPES)
  pqrsType?: (typeof PQRS_TYPES)[number];

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsString()
  municipality?: string;

  @IsOptional()
  @IsString()
  subject?: string;

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

  /** Lead flota (RF-CMS-FLT-002) — se reenvía al ERP si hay ERP_API_BASE_URL. */
  @IsOptional()
  @IsString()
  vehicleTypeId?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  estimatedHours?: number;

  @IsOptional()
  estimatedDays?: number;

  @IsBoolean()
  @Equals(true, { message: 'Debes aceptar el tratamiento de datos personales' })
  consent!: boolean;

  /** Honeypot anti-bot: si viene con valor, se descarta como spam. */
  @IsOptional()
  @IsString()
  website?: string;
}
