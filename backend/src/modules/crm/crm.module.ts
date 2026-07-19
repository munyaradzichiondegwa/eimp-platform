import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './entities/customer.entity';
import { KycDocument } from './entities/kyc-document.entity';
import { CommunicationLog } from './entities/communication-log.entity';
import { Lead } from './entities/lead.entity';
import { SupportTicket } from './entities/support-ticket.entity';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';
import { LeadTicketService } from './lead-ticket.service';
import { LeadTicketController } from './lead-ticket.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, KycDocument, CommunicationLog, Lead, SupportTicket]),
    AuditModule,
  ],
  providers: [CrmService, LeadTicketService],
  controllers: [CrmController, LeadTicketController],
  exports: [CrmService, LeadTicketService],
})
export class CrmModule {}
