import {
  IsArray,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator'

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  name!: string

  @IsOptional()
  @IsString()
  description?: string

  @IsArray()
  @IsString({ each: true })
  permissions!: string[]
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string

  @IsOptional()
  @IsString()
  description?: string | null

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[]
}
