import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsMongoId, IsOptional } from 'class-validator';
import { WHATSAPP_STATUSES, WhatsappStatus } from '../schemas/whatsapp-message.schema';

export class ListWhatsappMessagesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  leadId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @ApiPropertyOptional({ enum: WHATSAPP_STATUSES })
  @IsOptional()
  @IsIn(WHATSAPP_STATUSES)
  status?: WhatsappStatus;
}
