import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ChatSession, ChatRole, ChatSessionStatus, ChatMessageRecord } from './entities/chat-session.entity';
import { Policy } from '../underwriting/entities/policy.entity';
import { Claim } from '../claims/entities/claim.entity';
import { Invoice } from '../finance/entities/invoice.entity';
import { SupportTicket, TicketStatus, TicketPriority, TicketCategory } from '../crm/entities/support-ticket.entity';

/**
 * AI CUSTOMER SUPPORT CHATBOT
 * ----------------------------------------------------------------------
 * Calls the real Anthropic Messages API with tool use. The model can ask
 * to look up the customer's own policies, claims, and invoices, or raise
 * a support ticket - every tool executor below takes the authenticated
 * customerId from the session (never from the model's output) and queries
 * data scoped to that customer only. Even if a confused prompt asked the
 * model to fetch a different customer's policy, the executor functions
 * filter by session.customerId regardless of what argument the model passes.
 */

interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, any>; required?: string[] };
}

const TOOLS: AnthropicToolDef[] = [
  {
    name: 'get_my_policies',
    description: "List the customer's insurance policies with status, product, premium and dates.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_policy_detail',
    description: "Get full detail for one of the customer's own policies by policy number.",
    input_schema: {
      type: 'object',
      properties: { policyNumber: { type: 'string', description: 'e.g. EBA-POL-2026-000001' } },
      required: ['policyNumber'],
    },
  },
  {
    name: 'get_my_claims',
    description: "List the customer's claims with status and amounts.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_claim_detail',
    description: "Get full detail for one of the customer's own claims by claim number.",
    input_schema: {
      type: 'object',
      properties: { claimNumber: { type: 'string', description: 'e.g. EBA-CLM-2026-000001' } },
      required: ['claimNumber'],
    },
  },
  {
    name: 'get_my_invoices',
    description: "List the customer's premium invoices and outstanding balances.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'create_support_ticket',
    description: 'Raise a support ticket for the customer when their question needs human follow-up.',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['subject', 'description'],
    },
  },
];

const SYSTEM_PROMPT = `You are the customer support assistant for EBA Micro Insurance, a Zimbabwean insurance company regulated by IPEC. You help customers with questions about their policies, claims, and payments using the tools provided.

Rules:
- Only discuss the customer's own data, retrieved via the tools. Never invent policy numbers, amounts, or statuses.
- Keep answers short, plain-language, and friendly. Avoid insurance jargon where a simpler phrase works.
- If a question needs a human (complaints, disputes, anything you're not confident about), use create_support_ticket and tell the customer someone will follow up.
- If asked about something outside EBA Micro Insurance's services, say so directly and redirect to what you can help with.
- Currency is USD unless the customer's policy shows otherwise.
- Never ask for or repeat back full ID numbers, passwords, or payment card details.`;

const MAX_TOOL_ITERATIONS = 5;

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  constructor(
    @InjectRepository(ChatSession)
    private sessionRepo: Repository<ChatSession>,
    @InjectRepository(Policy)
    private policyRepo: Repository<Policy>,
    @InjectRepository(Claim)
    private claimRepo: Repository<Claim>,
    @InjectRepository(Invoice)
    private invoiceRepo: Repository<Invoice>,
    @InjectRepository(SupportTicket)
    private ticketRepo: Repository<SupportTicket>,
    private configService: ConfigService,
  ) {}

  async startOrGetSession(customerId: string, userId?: string): Promise<ChatSession> {
    const existing = await this.sessionRepo.findOne({
      where: { customerId, status: ChatSessionStatus.ACTIVE },
      order: { updatedAt: 'DESC' },
    });
    if (existing) return existing;

    const session = this.sessionRepo.create({
      customerId, userId, status: ChatSessionStatus.ACTIVE, messages: [],
    });
    return this.sessionRepo.save(session);
  }

  async sendMessage(sessionId: string, customerId: string, userMessage: string): Promise<{
    reply: string;
    session: ChatSession;
  }> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session || session.customerId !== customerId) {
      throw new Error('Chat session not found or does not belong to this customer');
    }

    const apiKey = this.configService.get<string>('ai.anthropicApiKey');
    if (!apiKey) {
      const fallback = "I'm not available right now - please use the Support section to raise a ticket and our team will get back to you.";
      this.appendMessage(session, ChatRole.USER, userMessage);
      this.appendMessage(session, ChatRole.ASSISTANT, fallback);
      await this.sessionRepo.save(session);
      return { reply: fallback, session };
    }

    this.appendMessage(session, ChatRole.USER, userMessage);

    const anthropicMessages: any[] = session.messages
      .filter(m => m.content)
      .map(m => ({ role: m.role, content: m.content }));

    let finalText = '';
    let iterations = 0;
    const toolCallsThisTurn: Array<{ name: string; input: any; result: any }> = [];

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      const response = await this.callAnthropic(anthropicMessages, apiKey);
      const content = response.content || [];

      const toolUseBlocks = content.filter((b: any) => b.type === 'tool_use');
      const textBlocks = content.filter((b: any) => b.type === 'text');

      if (toolUseBlocks.length === 0) {
        finalText = textBlocks.map((b: any) => b.text).join('\n').trim();
        break;
      }

      anthropicMessages.push({ role: 'assistant', content });

      const toolResults: any[] = [];
      for (const block of toolUseBlocks) {
        const result = await this.executeTool(block.name, block.input, customerId);
        toolCallsThisTurn.push({ name: block.name, input: block.input, result });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      anthropicMessages.push({ role: 'user', content: toolResults });

      if (response.stop_reason !== 'tool_use') {
        finalText = textBlocks.map((b: any) => b.text).join('\n').trim() || 'Let me look into that for you.';
        break;
      }
    }

    if (!finalText) {
      finalText = "I wasn't able to fully resolve that - I've noted it for our support team to follow up.";
    }

    this.appendMessage(session, ChatRole.ASSISTANT, finalText, toolCallsThisTurn);
    await this.sessionRepo.save(session);

    return { reply: finalText, session };
  }

  async endSession(sessionId: string, customerId: string): Promise<ChatSession> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session || session.customerId !== customerId) {
      throw new Error('Chat session not found');
    }
    session.status = ChatSessionStatus.ENDED;
    return this.sessionRepo.save(session);
  }

  async getHistory(customerId: string): Promise<ChatSession[]> {
    return this.sessionRepo.find({ where: { customerId }, order: { createdAt: 'DESC' }, take: 10 });
  }

  private async callAnthropic(messages: any[], apiKey: string): Promise<any> {
    const apiUrl = this.configService.get<string>('ai.anthropicApiUrl') || 'https://api.anthropic.com/v1/messages';
    const model = this.configService.get<string>('ai.anthropicModel') || 'claude-sonnet-4-6';
    const maxTokens = this.configService.get<number>('ai.anthropicMaxTokens') || 1024;

    try {
      const response = await axios.post(
        apiUrl,
        {
          model,
          max_tokens: maxTokens,
          system: SYSTEM_PROMPT,
          messages,
          tools: TOOLS,
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(`Anthropic API call failed: ${error.response?.data?.error?.message || error.message}`);
      throw error;
    }
  }

  private async executeTool(name: string, input: any, customerId: string): Promise<any> {
    try {
      switch (name) {
        case 'get_my_policies': {
          const policies = await this.policyRepo.find({
            where: { customerId },
            relations: ['product'],
            order: { createdAt: 'DESC' },
            take: 20,
          });
          return policies.map(p => ({
            policyNumber: p.policyNumber,
            product: p.product?.name,
            status: p.status,
            sumInsured: Number(p.sumInsured),
            grossPremium: Number(p.grossPremium),
            currency: p.currency,
            startDate: p.startDate,
            endDate: p.endDate,
            outstandingPremium: Number(p.outstandingPremium),
          }));
        }

        case 'get_policy_detail': {
          const policy = await this.policyRepo.findOne({
            where: { policyNumber: input.policyNumber, customerId },
            relations: ['product'],
          });
          if (!policy) return { error: 'Policy not found for this customer' };
          return {
            policyNumber: policy.policyNumber,
            product: policy.product?.name,
            status: policy.status,
            sumInsured: Number(policy.sumInsured),
            grossPremium: Number(policy.grossPremium),
            currency: policy.currency,
            startDate: policy.startDate,
            endDate: policy.endDate,
            outstandingPremium: Number(policy.outstandingPremium),
            beneficiaries: policy.beneficiaries,
          };
        }

        case 'get_my_claims': {
          const claims = await this.claimRepo.find({
            where: { customerId },
            order: { fnolDate: 'DESC' },
            take: 20,
          });
          return claims.map(c => ({
            claimNumber: c.claimNumber,
            claimType: c.claimType,
            status: c.status,
            claimedAmount: c.claimedAmount ? Number(c.claimedAmount) : null,
            settlementAmount: c.settlementAmount ? Number(c.settlementAmount) : null,
            currency: c.currency,
            fnolDate: c.fnolDate,
          }));
        }

        case 'get_claim_detail': {
          const claim = await this.claimRepo.findOne({ where: { claimNumber: input.claimNumber, customerId } });
          if (!claim) return { error: 'Claim not found for this customer' };
          return {
            claimNumber: claim.claimNumber,
            claimType: claim.claimType,
            status: claim.status,
            eventDate: claim.eventDate,
            claimedAmount: claim.claimedAmount ? Number(claim.claimedAmount) : null,
            approvedAmount: claim.approvedAmount ? Number(claim.approvedAmount) : null,
            settlementAmount: claim.settlementAmount ? Number(claim.settlementAmount) : null,
            settlementDate: claim.settlementDate,
            rejectionReason: claim.rejectionReason,
          };
        }

        case 'get_my_invoices': {
          const invoices = await this.invoiceRepo.find({
            where: { customerId },
            order: { createdAt: 'DESC' },
            take: 20,
          });
          return invoices.map(i => ({
            invoiceNumber: i.invoiceNumber,
            status: i.status,
            totalAmount: Number(i.totalAmount),
            outstandingAmount: Number(i.outstandingAmount),
            currency: i.currency,
            dueDate: i.dueDate,
          }));
        }

        case 'create_support_ticket': {
          const count = await this.ticketRepo.count();
          const ticket = this.ticketRepo.create({
            customerId,
            subject: input.subject,
            description: input.description,
            priority: TicketPriority.MEDIUM,
            category: TicketCategory.GENERAL,
            status: TicketStatus.OPEN,
            ticketNumber: `EBA-TKT-${String(count + 1).padStart(6, '0')}`,
            comments: [],
            createdById: 'ai-chatbot',
          });
          const saved = await this.ticketRepo.save(ticket);
          return { ticketNumber: saved.ticketNumber, status: 'created' };
        }

        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (err: any) {
      this.logger.error(`Tool execution failed (${name}): ${err.message}`);
      return { error: 'Lookup failed - please try again or contact support directly.' };
    }
  }

  private appendMessage(
    session: ChatSession,
    role: ChatRole,
    content: string,
    toolCalls?: Array<{ name: string; input: any; result: any }>,
  ): void {
    const record: ChatMessageRecord = {
      role, content, toolCalls, timestamp: new Date().toISOString(),
    };
    session.messages = [...(session.messages || []), record];
    session.messageCount = session.messages.length;
  }
}
