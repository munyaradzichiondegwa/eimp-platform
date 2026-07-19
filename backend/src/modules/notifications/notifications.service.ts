import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import axios from 'axios';

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
  cc?: string[];
  replyTo?: string;
}

export interface SmsPayload {
  to: string;   // E.164 format: +2637XXXXXXXX
  message: string;
}

export interface WhatsAppPayload {
  to: string;
  templateName: string;
  templateParams: string[];
  languageCode?: string;
}

export interface NotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private mailerTransport: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initMailer();
  }

  private initMailer(): void {
    const smtpHost = this.configService.get('email.smtpHost');
    const smtpUser = this.configService.get('email.smtpUser');

    if (smtpHost && smtpUser) {
      this.mailerTransport = nodemailer.createTransport({
        host: smtpHost,
        port: this.configService.get<number>('email.smtpPort') || 587,
        secure: false,
        auth: {
          user: smtpUser,
          pass: this.configService.get('email.smtpPass'),
        },
      });
    } else {
      // AWS SES via SMTP (recommended for production)
      // For dev, use Mailtrap or similar
      this.mailerTransport = nodemailer.createTransport({
        host: 'smtp.mailtrap.io',
        port: 2525,
        auth: {
          user: process.env.MAILTRAP_USER || 'dev',
          pass: process.env.MAILTRAP_PASS || 'dev',
        },
      });
      this.logger.warn('Using development email transport. Configure SMTP_HOST for production.');
    }
  }

  // ── EMAIL ─────────────────────────────────────────────────────────────────

  async sendEmail(payload: EmailPayload): Promise<NotificationResult> {
    if (!this.mailerTransport) {
      return { success: false, error: 'Email transport not configured' };
    }

    try {
      const fromEmail = this.configService.get<string>('email.fromEmail');
      const fromName = this.configService.get<string>('email.fromName');

      const info = await this.mailerTransport.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: Array.isArray(payload.to) ? payload.to.join(',') : payload.to,
        cc: payload.cc?.join(','),
        replyTo: payload.replyTo,
        subject: payload.subject,
        html: payload.html,
        text: payload.text || payload.html.replace(/<[^>]*>/g, ''),
        attachments: payload.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });

      this.logger.log(`Email sent to ${payload.to} — messageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      this.logger.error(`Email failed to ${payload.to}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ── SMS ───────────────────────────────────────────────────────────────────

  async sendSms(payload: SmsPayload): Promise<NotificationResult> {
    const provider = this.configService.get<string>('sms.provider') || 'twilio';

    if (provider === 'econet') {
      return this.sendSmsEconet(payload);
    }
    return this.sendSmsTwilio(payload);
  }

  private async sendSmsTwilio(payload: SmsPayload): Promise<NotificationResult> {
    const sid = this.configService.get<string>('sms.twilioSid');
    const token = this.configService.get<string>('sms.twilioToken');
    const from = this.configService.get<string>('sms.twilioPhone');

    if (!sid || !token || !from) {
      this.logger.warn('Twilio credentials not configured — SMS skipped (dev mode)');
      this.logger.debug(`[DEV SMS] To: ${payload.to} | Message: ${payload.message}`);
      return { success: true, messageId: 'dev-mock-sms-id' };
    }

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
      const response = await axios.post(
        url,
        new URLSearchParams({ To: payload.to, From: from, Body: payload.message }),
        {
          auth: { username: sid, password: token },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000,
        },
      );

      this.logger.log(`SMS sent to ${payload.to} via Twilio — SID: ${response.data.sid}`);
      return { success: true, messageId: response.data.sid };
    } catch (error) {
      this.logger.error(`SMS failed to ${payload.to}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  private async sendSmsEconet(payload: SmsPayload): Promise<NotificationResult> {
    const apiUrl = this.configService.get<string>('sms.econetApiUrl');
    const apiKey = this.configService.get<string>('sms.econetApiKey');

    if (!apiUrl || !apiKey) {
      this.logger.warn('Econet SMS API not configured — SMS skipped');
      return { success: false, error: 'Econet SMS not configured' };
    }

    try {
      const response = await axios.post(
        apiUrl,
        { to: payload.to, message: payload.message, sender: 'EBA Micro' },
        {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          timeout: 10000,
        },
      );
      return { success: true, messageId: response.data?.messageId };
    } catch (error) {
      this.logger.error(`Econet SMS failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ── WHATSAPP ─────────────────────────────────────────────────────────────

  async sendWhatsApp(payload: WhatsAppPayload): Promise<NotificationResult> {
    const apiUrl = this.configService.get<string>('whatsapp.apiUrl');
    const apiKey = this.configService.get<string>('whatsapp.apiKey');
    const phoneNumberId = this.configService.get<string>('whatsapp.phoneNumberId');

    if (!apiUrl || !apiKey || !phoneNumberId) {
      this.logger.warn('WhatsApp API not configured — message skipped (dev mode)');
      this.logger.debug(`[DEV WhatsApp] To: ${payload.to} | Template: ${payload.templateName}`);
      return { success: true, messageId: 'dev-mock-wa-id' };
    }

    try {
      const response = await axios.post(
        `${apiUrl}/messages`,
        {
          messaging_product: 'whatsapp',
          to: payload.to.replace('+', ''),
          type: 'template',
          template: {
            name: payload.templateName,
            language: { code: payload.languageCode || 'en' },
            components: payload.templateParams.length > 0 ? [{
              type: 'body',
              parameters: payload.templateParams.map((p) => ({ type: 'text', text: p })),
            }] : [],
          },
        },
        {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          timeout: 10000,
        },
      );

      return { success: true, messageId: response.data?.messages?.[0]?.id };
    } catch (error) {
      this.logger.error(`WhatsApp failed to ${payload.to}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ── TEMPLATE HELPERS ──────────────────────────────────────────────────────

  async sendPolicyIssuedEmail(
    to: string,
    data: { customerName: string; policyNumber: string; productName: string; startDate: string; endDate: string; premium: number; currency: string },
  ): Promise<NotificationResult> {
    return this.sendEmail({
      to,
      subject: `EBA Micro Insurance — Policy Certificate: ${data.policyNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><style>
          body { font-family: Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 0; }
          .header { background: #C8102E; color: white; padding: 24px 32px; }
          .header h1 { margin: 0; font-size: 20px; }
          .content { padding: 32px; }
          .policy-box { background: #f8f8f8; border-left: 4px solid #C8102E; padding: 20px; margin: 20px 0; border-radius: 4px; }
          .policy-box table { width: 100%; border-collapse: collapse; }
          .policy-box td { padding: 8px 0; font-size: 14px; }
          .policy-box td:first-child { color: #555; width: 40%; }
          .policy-box td:last-child { font-weight: bold; }
          .footer { background: #1a1a1a; color: #999; padding: 20px 32px; font-size: 12px; margin-top: 32px; }
          .btn { display: inline-block; background: #C8102E; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 16px; }
        </style></head>
        <body>
          <div class="header"><h1>EBA Micro Insurance</h1><p style="margin:4px 0 0;font-size:13px;opacity:.85;">Your coverage is confirmed</p></div>
          <div class="content">
            <p>Dear ${data.customerName},</p>
            <p>Thank you for choosing EBA Micro Insurance. Your policy has been issued and is now active.</p>
            <div class="policy-box">
              <table>
                <tr><td>Policy Number</td><td>${data.policyNumber}</td></tr>
                <tr><td>Product</td><td>${data.productName}</td></tr>
                <tr><td>Start Date</td><td>${data.startDate}</td></tr>
                <tr><td>End Date</td><td>${data.endDate}</td></tr>
                <tr><td>Annual Premium</td><td>${data.currency} ${data.premium.toFixed(2)}</td></tr>
              </table>
            </div>
            <p>You can access your policy documents, make payments, and track claims through our customer portal.</p>
            <a href="${process.env.FRONTEND_URL || 'https://portal.ebamicroinsurance.co.zw'}" class="btn">Access Your Portal</a>
            <p style="margin-top:24px;font-size:13px;color:#555;">For assistance, contact us at <a href="mailto:support@ebamicroinsurance.co.zw">support@ebamicroinsurance.co.zw</a> or call our helpline.</p>
          </div>
          <div class="footer"><p>EBA Micro Insurance Company (Pvt) Ltd &bull; Regulated by IPEC Zimbabwe &bull; This is an automated message.</p></div>
        </body></html>
      `,
    });
  }

  async sendRenewalReminder(
    to: string,
    phone: string,
    data: { customerName: string; policyNumber: string; expiryDate: string; daysLeft: number; premium: number; currency: string },
  ): Promise<void> {
    await Promise.allSettled([
      this.sendEmail({
        to,
        subject: `Action Required: Your policy ${data.policyNumber} expires in ${data.daysLeft} days`,
        html: `
          <!DOCTYPE html><html><head><meta charset="utf-8"><style>
            body{font-family:Arial,sans-serif;color:#1a1a1a}
            .header{background:#C8102E;color:white;padding:24px 32px}
            .content{padding:32px}
            .alert{background:#fff3cd;border:1px solid #ffc107;padding:16px;border-radius:4px;margin:16px 0}
            .btn{display:inline-block;background:#C8102E;color:white;padding:12px 24px;text-decoration:none;border-radius:4px;font-weight:bold;margin-top:16px}
          </style></head>
          <body>
            <div class="header"><h1>EBA Micro Insurance</h1></div>
            <div class="content">
              <p>Dear ${data.customerName},</p>
              <div class="alert"><strong>Your policy expires in ${data.daysLeft} days.</strong><br>Policy: ${data.policyNumber} &bull; Expiry: ${data.expiryDate}</div>
              <p>Renew now to ensure continuous coverage. Your renewal premium is <strong>${data.currency} ${data.premium.toFixed(2)}</strong>.</p>
              <a href="${process.env.FRONTEND_URL || 'https://portal.ebamicroinsurance.co.zw'}/renew/${data.policyNumber}" class="btn">Renew My Policy</a>
            </div>
          </body></html>
        `,
      }),
      phone ? this.sendSms({
        to: phone,
        message: `EBA Micro Insurance: Your policy ${data.policyNumber} expires in ${data.daysLeft} days. Renew now at portal.ebamicroinsurance.co.zw or call us. Premium: ${data.currency} ${data.premium.toFixed(2)}.`,
      }) : Promise.resolve(),
    ]);
  }

  async sendClaimAcknowledgement(
    to: string,
    phone: string,
    data: { customerName: string; claimNumber: string; policyNumber: string; submittedDate: string },
  ): Promise<void> {
    await Promise.allSettled([
      this.sendEmail({
        to,
        subject: `Claim Received: ${data.claimNumber}`,
        html: `
          <!DOCTYPE html><html><head><meta charset="utf-8"><style>
            body{font-family:Arial,sans-serif;color:#1a1a1a}.header{background:#C8102E;color:white;padding:24px 32px}.content{padding:32px}
            .box{background:#f0f7ff;border-left:4px solid #0066cc;padding:16px;border-radius:4px;margin:16px 0}
          </style></head>
          <body>
            <div class="header"><h1>EBA Micro Insurance</h1></div>
            <div class="content">
              <p>Dear ${data.customerName},</p>
              <p>We have received your claim. Our team will review it promptly.</p>
              <div class="box">
                <strong>Claim Reference: ${data.claimNumber}</strong><br>
                Policy: ${data.policyNumber}<br>Submitted: ${data.submittedDate}
              </div>
              <p>You will receive updates as your claim progresses. Our target settlement time is 5 business days.</p>
            </div>
          </body></html>
        `,
      }),
      phone ? this.sendSms({
        to: phone,
        message: `EBA Micro Insurance: Claim ${data.claimNumber} received for policy ${data.policyNumber}. We will contact you within 24 hours. Ref: ${data.claimNumber}`,
      }) : Promise.resolve(),
    ]);
  }

  async sendPaymentReceipt(
    to: string,
    phone: string,
    data: { customerName: string; policyNumber: string; amount: number; currency: string; channel: string; paymentRef: string; date: string },
  ): Promise<void> {
    await Promise.allSettled([
      this.sendEmail({
        to,
        subject: `Payment Receipt — ${data.paymentRef}`,
        html: `
          <!DOCTYPE html><html><head><meta charset="utf-8"><style>
            body{font-family:Arial,sans-serif;color:#1a1a1a}.header{background:#C8102E;color:white;padding:24px 32px}.content{padding:32px}
            .receipt{background:#f8f8f8;border-left:4px solid #28a745;padding:16px;border-radius:4px;margin:16px 0}
          </style></head>
          <body>
            <div class="header"><h1>EBA Micro Insurance</h1></div>
            <div class="content">
              <p>Dear ${data.customerName},</p>
              <p>Payment received. Thank you.</p>
              <div class="receipt">
                <strong>Amount: ${data.currency} ${data.amount.toFixed(2)}</strong><br>
                Policy: ${data.policyNumber}<br>
                Channel: ${data.channel}<br>
                Ref: ${data.paymentRef}<br>
                Date: ${data.date}
              </div>
            </div>
          </body></html>
        `,
      }),
      phone ? this.sendSms({
        to: phone,
        message: `EBA Micro Insurance: Payment of ${data.currency} ${data.amount.toFixed(2)} received for policy ${data.policyNumber} via ${data.channel}. Ref: ${data.paymentRef}. Thank you.`,
      }) : Promise.resolve(),
    ]);
  }

  async sendOtp(phone: string, otp: string, purpose = 'login'): Promise<NotificationResult> {
    return this.sendSms({
      to: phone,
      message: `EBA Micro Insurance: Your OTP for ${purpose} is ${otp}. Valid for 5 minutes. Do not share this code.`,
    });
  }
}
