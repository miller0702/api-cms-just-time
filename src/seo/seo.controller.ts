import { Controller, Get } from '@nestjs/common';
import { SeoService } from './seo.service';

@Controller()
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  /** Rutas públicas indexables; el front las convierte en sitemap.xml al construir. */
  @Get('sitemap')
  sitemap() {
    return this.seo.sitemap();
  }
}
