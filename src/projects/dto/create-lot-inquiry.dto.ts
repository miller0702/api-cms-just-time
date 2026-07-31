import {
  Equals,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateLotInquiryDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(7)
  phone?: string;

  @IsOptional()
  @IsString()
  message?: string;

  /** Código visible del lote (el mapa lo conoce); si falta se usa el id del ERP. */
  @IsOptional()
  @IsString()
  lotCode?: string;

  @IsBoolean()
  @Equals(true, { message: 'Debes aceptar el tratamiento de datos personales' })
  consentAccepted!: boolean;

  /** Honeypot anti-bot; debe permanecer vacío para usuarios reales. */
  @IsOptional()
  @IsString()
  website?: string;
}
