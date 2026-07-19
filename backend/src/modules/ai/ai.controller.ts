import {
  Controller, Get, Post, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RiskScoringService } from './risk-scoring.service';
import { FraudDetectionService } from './fraud-detection.service';
import { PredictiveAnalyticsService } from './predictive-analytics.service';
import { ForecastingService } from './forecasting.service';
import { ChatbotService } from './chatbot.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';

@ApiTags('AI - Phase 2 Enhancements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly riskScoring: RiskScoringService,
    private readonly fraudDetection: FraudDetectionService,
    private readonly predictiveAnalytics: PredictiveAnalyticsService,
    private readonly forecasting: ForecastingService,
    private readonly chatbot: ChatbotService,
  ) {}

  @Get('predictive/at-risk-renewals')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.UNDERWRITER, UserRole.BROKER)
  @ApiOperation({ summary: 'Policies expiring soon, ranked by lapse risk - for proactive retention outreach' })
  getAtRiskRenewals(@Query('lookaheadDays') lookaheadDays = '60') {
    return this.predictiveAnalytics.getAtRiskRenewals(parseInt(lookaheadDays));
  }

  @Get('predictive/customer-value/:customerId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE, UserRole.UNDERWRITER)
  @ApiOperation({ summary: 'Estimated customer lifetime value - premium paid vs claims paid' })
  getCustomerValue(@Param('customerId') customerId: string) {
    return this.predictiveAnalytics.estimateCustomerValue(customerId);
  }

  @Get('forecasting/gwp')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE)
  @ApiOperation({ summary: 'GWP forecast - linear regression on historical monthly premium data' })
  getGwpForecast(@Query('horizonMonths') horizonMonths = '6') {
    return this.forecasting.getGwpForecast(parseInt(horizonMonths));
  }

  @Get('forecasting/claims')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.FINANCE, UserRole.CLAIMS_OFFICER)
  @ApiOperation({ summary: 'Claims forecast - linear regression on historical settled claims' })
  getClaimsForecast(@Query('horizonMonths') horizonMonths = '6') {
    return this.forecasting.getClaimsForecast(parseInt(horizonMonths));
  }

  @Get('chat/history/:customerId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.COMPLIANCE)
  @ApiOperation({ summary: 'Staff view of a customer chatbot conversation history for audit and QA' })
  getChatHistory(@Param('customerId') customerId: string) {
    return this.chatbot.getHistory(customerId);
  }
}
