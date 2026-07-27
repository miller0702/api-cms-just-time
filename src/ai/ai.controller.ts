import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { GenerateContentDto } from './dto/generate-content.dto';
import { ChatAgentDto } from './dto/chat-agent.dto';
import { AdminHelpDto } from './dto/admin-help.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getStatus() {
    const configured = await this.aiService.isConfigured();
    return {
      enabled: configured,
      message: configured
        ? 'Servicio de IA configurado y listo'
        : 'Servicio de IA no configurado. Falta OPENAI_API_KEY.',
    };
  }

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  async generateContent(@Body() dto: GenerateContentDto) {
    const result = await this.aiService.generateContent(dto);
    return {
      success: true,
      data: result,
    };
  }

  /**
   * Chat público del agente - no requiere autenticación
   */
  @Post('chat')
  async chatAgent(@Body() dto: ChatAgentDto) {
    return this.aiService.chatAgent(dto);
  }

  /**
   * Asistente de ayuda del panel admin - requiere autenticación
   */
  @Post('admin-help')
  @UseGuards(JwtAuthGuard)
  async adminHelp(@Body() dto: AdminHelpDto) {
    return this.aiService.adminHelp(dto.message, dto.currentPage);
  }
}
