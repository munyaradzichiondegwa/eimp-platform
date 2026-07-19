import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';

import configuration from './config/configuration';

// Auth
import { AuthModule } from './common/auth/auth.module';

// Business modules
import { UsersModule } from './modules/users/users.module';
import { CrmModule } from './modules/crm/crm.module';
import { UnderwritingModule } from './modules/underwriting/underwriting.module';
import { ClaimsModule } from './modules/claims/claims.module';
import { FinanceModule } from './modules/finance/finance.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AiModule } from './modules/ai/ai.module';
import { CustomerPortalModule } from './modules/customer-portal/customer-portal.module';
import { UploadsModule } from './modules/uploads/uploads.module';

// Entities (for TypeORM)
import { User } from './modules/users/entities/user.entity';
import { Customer } from './modules/crm/entities/customer.entity';
import { KycDocument } from './modules/crm/entities/kyc-document.entity';
import { CommunicationLog } from './modules/crm/entities/communication-log.entity';
import { Product } from './modules/underwriting/entities/product.entity';
import { Policy } from './modules/underwriting/entities/policy.entity';
import { PolicyEndorsement } from './modules/underwriting/entities/endorsement.entity';
import { Broker } from './modules/underwriting/entities/broker.entity';
import { CommissionStatement } from './modules/underwriting/entities/commission-statement.entity';
import { Claim } from './modules/claims/entities/claim.entity';
import { ClaimDocument } from './modules/claims/entities/claim-document.entity';
import { GlAccount } from './modules/finance/entities/gl-account.entity';
import { GlEntry } from './modules/finance/entities/gl-entry.entity';
import { Invoice } from './modules/finance/entities/invoice.entity';
import { Payment } from './modules/finance/entities/payment.entity';
import { FixedAsset } from './modules/finance/entities/fixed-asset.entity';
import { ReinsuranceTreaty } from './modules/finance/entities/reinsurance-treaty.entity';
import { ReinsuranceCession } from './modules/finance/entities/reinsurance-cession.entity';
import { ReinsuranceRecovery } from './modules/finance/entities/reinsurance-recovery.entity';
import { ReinsuranceBordereau } from './modules/finance/entities/reinsurance-bordereau.entity';
import { WeatherReading } from './modules/underwriting/entities/weather-reading.entity';
import { WeatherTriggerEvent } from './modules/underwriting/entities/weather-trigger-event.entity';
import { AuditLog } from './modules/audit/entities/audit-log.entity';
import { Lead } from './modules/crm/entities/lead.entity';
import { SupportTicket } from './modules/crm/entities/support-ticket.entity';
import { ChatSession } from './modules/ai/entities/chat-session.entity';

// Scheduled jobs
import { ScheduledJobsService } from './modules/notifications/scheduled-jobs.service';

// (PaymentGatewayService & Controller registered inside FinanceModule)

const ALL_ENTITIES = [
  User, Customer, KycDocument, CommunicationLog, Lead, SupportTicket,
  Product, Policy, PolicyEndorsement, Broker, CommissionStatement,
  WeatherReading, WeatherTriggerEvent,
  Claim, ClaimDocument,
  GlAccount, GlEntry, Invoice, Payment, FixedAsset,
  ReinsuranceTreaty, ReinsuranceCession, ReinsuranceRecovery, ReinsuranceBordereau,
  ChatSession,
  AuditLog,
];

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting: 100 requests/minute per IP
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // Scheduling
    ScheduleModule.forRoot(),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        entities: ALL_ENTITIES,
        synchronize: config.get<boolean>('database.synchronize'),
        logging: config.get<boolean>('database.logging'),
        schema: 'public',
        extra: {
          max: 20,
          min: 2,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        },
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      }),
    }),

    // Feature modules
    AuthModule,
    UsersModule,
    AuditModule,
    CrmModule,
    UnderwritingModule,
    ClaimsModule,
    FinanceModule,
    ReportingModule,
    NotificationsModule,
    AiModule,
    CustomerPortalModule,
    UploadsModule,

    // TypeORM for scheduled jobs (needs direct repo access)
    TypeOrmModule.forFeature([Policy, Customer, Payment, Invoice]),
  ],
  providers: [ScheduledJobsService],
  controllers: [],
})
export class AppModule {}
