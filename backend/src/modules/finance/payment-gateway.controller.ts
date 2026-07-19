import {
  Controller, Post, Body, Param, UseGuards, Get, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentGatewayService, InitiatePaymentRequest } from './payment-gateway.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { PaymentChannel } from './entities/payment.entity';
import { Public } from '../../common/decorators/roles.decorator';

@ApiTags('Payments — Mobile Money & Gateway')
@Controller('payments')
export class PaymentGatewayController {
  constructor(private readonly svc: PaymentGatewayService) {}

  @Post('initiate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Initiate mobile money payment (EcoCash, OneMoney, InnBucks)' })
  initiate(@Body() req: InitiatePaymentRequest) {
    return this.svc.initiatePayment(req);
  }

  // Webhook endpoints — public (verified by HMAC in production)
  @Post('webhook/ecocash')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'EcoCash payment callback webhook' })
  webhookEcoCash(@Body() payload: any) {
    return this.svc.handleWebhook(PaymentChannel.ECOCASH, payload);
  }

  @Post('webhook/onemoney')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'OneMoney payment callback webhook' })
  webhookOneMoney(@Body() payload: any) {
    return this.svc.handleWebhook(PaymentChannel.ONEMONEY, payload);
  }

  @Post('webhook/innbucks')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'InnBucks payment callback webhook' })
  webhookInnBucks(@Body() payload: any) {
    return this.svc.handleWebhook(PaymentChannel.INNBUCKS, payload);
  }
}
