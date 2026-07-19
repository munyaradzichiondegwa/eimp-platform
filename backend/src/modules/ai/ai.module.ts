import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatSession } from './entities/chat-session.entity';
import { Policy } from '../underwriting/entities/policy.entity';
import { Claim } from '../claims/entities/claim.entity';
import { Invoice } from '../finance/entities/invoice.entity';
import { Payment } from '../finance/entities/payment.entity';
import { SupportTicket } from '../crm/entities/support-ticket.entity';
import { RiskScoringService } from './risk-scoring.service';
import { FraudDetectionService } from './fraud-detection.service';
import { PredictiveAnalyticsService } from './predictive-analytics.service';
import { ForecastingService } from './forecasting.service';
import { ChatbotService } from './chatbot.service';
import { AiController } from './ai.controller';

/**
 * AiModule deliberately injects entities directly (TypeOrmModule.forFeature)
 * rather than importing UnderwritingModule / ClaimsModule / FinanceModule.
 * UnderwritingModule and ClaimsModule both depend on AiModule for scoring,
 * so AiModule must not depend back on them — that would be circular. Direct
 * repository access keeps AiModule a leaf dependency with no cycle risk.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ChatSession, Policy, Claim, Invoice, Payment, SupportTicket]),
  ],
  providers: [
    RiskScoringService,
    FraudDetectionService,
    PredictiveAnalyticsService,
    ForecastingService,
    ChatbotService,
  ],
  controllers: [AiController],
  exports: [
    RiskScoringService,
    FraudDetectionService,
    PredictiveAnalyticsService,
    ForecastingService,
    ChatbotService,
  ],
})
export class AiModule {}
