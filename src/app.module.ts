import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { EnvironmentVariables, validateEnv } from './config/env.validation';
import { CustomersModule } from './customers/customers.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExpensesModule } from './expenses/expenses.module';
import { FinanceModule } from './finance/finance.module';
import { HealthController } from './health.controller';
import { InternalProjectsModule } from './internal-projects/internal-projects.module';
import { LeadsModule } from './leads/leads.module';
import { PaymentsModule } from './payments/payments.module';
import { PortalModule } from './portal/portal.module';
import { ProjectsModule } from './projects/projects.module';
import { StaffModule } from './staff/staff.module';
import { UsersModule } from './users/users.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { WorkLogsModule } from './work-logs/work-logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // Tests inject their own environment (in-memory replica set).
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        uri: config.get('MONGODB_URI', { infer: true }),
        autoIndex: true,
        autoCreate: true,
        // Transactions need majority writes on a replica set (local rs0 or Atlas).
        retryWrites: true,
        serverSelectionTimeoutMS: 10000,
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => [
        {
          ttl: config.get('THROTTLE_TTL', { infer: true }),
          limit: config.get('THROTTLE_LIMIT', { infer: true }),
        },
      ],
    }),
    AuthModule,
    UsersModule,
    CustomersModule,
    StaffModule,
    LeadsModule,
    ProjectsModule,
    PaymentsModule,
    ExpensesModule,
    FinanceModule,
    DashboardModule,
    PortalModule,
    WorkLogsModule,
    WhatsappModule,
    InternalProjectsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: authenticate first, then authorise.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
