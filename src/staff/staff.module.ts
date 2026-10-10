import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Staff, StaffSchema } from './schemas/staff.schema';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { WorkLogsModule } from '../work-logs/work-logs.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: Staff.name, schema: StaffSchema }]), WorkLogsModule],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
