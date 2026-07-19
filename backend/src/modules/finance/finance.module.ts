import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GlAccount } from './entities/gl-account.entity';
import { GlEntry } from './entities/gl-entry.entity';
import { Invoice } from './entities/invoice.entity';
import { Payment } from './entities/payment.entity';
import { FixedAsset } from './entities/fixed-asset.entity';
import { ReinsuranceTreaty } from './entities/reinsurance-treaty.entity';
import { ReinsuranceCession } from './entities/reinsurance-cession.entity';
import { ReinsuranceRecovery } from './entities/reinsurance-recovery.entity';
import { ReinsuranceBordereau } from './entities/reinsurance-bordereau.entity';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';
import { PaymentGatewayService } from './payment-gateway.service';
import { PaymentGatewayController } from './payment-gateway.controller';
import { FixedAssetService } from './fixed-asset.service';
import { FixedAssetController } from './fixed-asset.controller';
import { ReinsuranceService } from './reinsurance.service';
import { ReinsuranceController } from './reinsurance.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GlAccount, GlEntry, Invoice, Payment, FixedAsset,
      ReinsuranceTreaty, ReinsuranceCession, ReinsuranceRecovery, ReinsuranceBordereau,
    ]),
    AuditModule,
  ],
  providers: [FinanceService, PaymentGatewayService, FixedAssetService, ReinsuranceService],
  controllers: [FinanceController, PaymentGatewayController, FixedAssetController, ReinsuranceController],
  exports: [FinanceService, PaymentGatewayService, FixedAssetService, ReinsuranceService],
})
export class FinanceModule {}
