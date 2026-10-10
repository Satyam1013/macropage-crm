import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';
import { ListWhatsappMessagesQueryDto } from './dto/whatsapp.dto';
import { WhatsappService } from './whatsapp.service';

@ApiTags('WhatsApp')
@ApiBearerAuth()
@Controller('whatsapp-messages')
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Get()
  @ApiOperation({ summary: 'Message audit trail, newest first (max 500)' })
  list(@Query() query: ListWhatsappMessagesQueryDto) {
    return this.whatsapp.list(query);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-queue a FAILED message' })
  retry(@Param('id', ParseObjectIdPipe) id: string) {
    return this.whatsapp.retry(id);
  }
}
