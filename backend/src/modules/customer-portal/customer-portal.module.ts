import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../crm/entities/customer.entity';
import { CustomerPortalService } from './customer-portal.service';
import { CustomerPortalController } from './customer-portal.controller';
import { CrmModule } from '../crm/crm.module';
import { UnderwritingModule } from '../underwriting/underwriting.module';
import { ClaimsModule } from '../claims/claims.module';
import { FinanceModule } from '../finance/finance.module';
import { AiModule } from '../ai/ai.module';

/**
 * CustomerPortalModule depends on Crm/Underwriting/Claims/Finance/Ai but none
 * of those modules import CustomerPortalModule back, so there is no cycle.
 * This module exists purely to compose and re-scope existing business logic
 * for the self-service channel - it adds no new core domain behaviour of its
 * own, only the customer-facing access boundary in CustomerPortalService.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Customer]),
    CrmModule,
    UnderwritingModule,
    ClaimsModule,
    FinanceModule,
    AiModule,
  ],
  providers: [CustomerPortalService],
  controllers: [CustomerPortalController],
  exports: [CustomerPortalService],
})
export class CustomerPortalModule {}
