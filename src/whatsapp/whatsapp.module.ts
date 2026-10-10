import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsappMessage, WhatsappMessageSchema } from './schemas/whatsapp-message.schema';
import { WhatsappController } from './whatsapp.controller';
import { LogWhatsappProvider, WhatsappProvider } from './whatsapp.provider';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: WhatsappMessage.name, schema: WhatsappMessageSchema }]),
  ],
  controllers: [WhatsappController],
  // Swap LogWhatsappProvider for a real provider here.
  providers: [WhatsappService, { provide: WhatsappProvider, useClass: LogWhatsappProvider }],
  exports: [WhatsappService],
})
export class WhatsappModule {}
