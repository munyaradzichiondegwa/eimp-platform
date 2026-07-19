import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Policy } from '../underwriting/entities/policy.entity';
import { Claim } from '../claims/entities/claim.entity';
import { Invoice } from '../finance/entities/invoice.entity';
import { Payment } from '../finance/entities/payment.entity';
import { Customer } from '../crm/entities/customer.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { ReportingService } from './reporting.service';
import { ReportingController } from './reporting.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Policy, Claim, Invoice, Payment, Customer, AuditLog]),
  ],
  providers: [ReportingService],
  controllers: [ReportingController],
  exports: [ReportingService],
})
export class ReportingModule {}
