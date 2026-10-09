import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { ProjectsModule } from '../projects/projects.module';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: Payment.name, schema: PaymentSchema },
    ]),
    ProjectsModule,
  ],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
