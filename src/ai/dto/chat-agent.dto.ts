import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ChatAgentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  pathname?: string;
}
