import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { Policy } from './entities/policy.entity';
import { PolicyEndorsement } from './entities/endorsement.entity';
import { Broker } from './entities/broker.entity';
import { CommissionStatement } from './entities/commission-statement.entity';
import { WeatherReading } from './entities/weather-reading.entity';
import { WeatherTriggerEvent } from './entities/weather-trigger-event.entity';
import { Customer } from '../crm/entities/customer.entity';
import { UnderwritingService } from './underwriting.service';
import { UnderwritingController } from './underwriting.controller';
import { BrokerPortalService } from './broker-portal.service';
import { BrokerPortalController } from './broker-portal.controller';
import { DocumentGenerationService } from './document-generation.service';
import { WeatherIndexService } from './weather-index.service';
import { WeatherIndexController } from './weather-index.controller';
import { AuditModule } from '../audit/audit.module';
import { ClaimsModule } from '../claims/claims.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product, Policy, PolicyEndorsement, Broker, CommissionStatement,
      WeatherReading, WeatherTriggerEvent, Customer,
    ]),
    AuditModule,
    ClaimsModule,
    AiModule,
  ],
  providers: [
    UnderwritingService, BrokerPortalService, DocumentGenerationService, WeatherIndexService,
  ],
  controllers: [
    UnderwritingController, BrokerPortalController, WeatherIndexController,
  ],
  exports: [UnderwritingService, BrokerPortalService, DocumentGenerationService, WeatherIndexService],
})
export class UnderwritingModule {}
