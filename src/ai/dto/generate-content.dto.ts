import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export enum ContentType {
  TITLE = 'title',
  SUMMARY = 'summary',
  BODY = 'body',
  SEO_DESCRIPTION = 'seo_description',
  IMPROVE = 'improve',
  TAGS = 'tags',
  HEADLINE = 'headline',
  SLUG = 'slug',
}

export enum ContentContext {
  NEWS = 'news',
  SERVICE = 'service',
  PROJECT = 'project',
  PAGE = 'page',
  PILL = 'pill',
  GENERAL = 'general',
}

export class GenerateContentDto {
  @IsEnum(ContentType)
  type!: ContentType;

  @IsEnum(ContentContext)
  @IsOptional()
  context?: ContentContext = ContentContext.GENERAL;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  prompt!: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  existingContent?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  tone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  language?: string = 'es';
}
