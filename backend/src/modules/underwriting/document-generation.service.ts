import { Injectable, Logger } from '@nestjs/common';
import PdfPrinter from 'pdfmake';
import { Policy } from './entities/policy.entity';
import { Customer } from '../crm/entities/customer.entity';
import { Product } from './entities/product.entity';
import { PolicyEndorsement } from './entities/endorsement.entity';

// Standard font configuration for pdfmake (Helvetica — no external font files needed)
const FONTS = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

const BRAND = {
  red: '#C8102E',
  gold: '#C9A84C',
  black: '#1A1A1A',
  grey: '#666666',
};

@Injectable()
export class DocumentGenerationService {
  private readonly logger = new Logger(DocumentGenerationService.name);
  private printer: any;

  constructor() {
    this.printer = new (PdfPrinter as any)(FONTS);
  }

  // ── POLICY SCHEDULE (UW-04) ────────────────────────────────────────────────
  // Acceptance criteria: generated within 60s of approval, accurate policy
  // details, delivered to customer email automatically.

  async generatePolicySchedule(
    policy: Policy, customer: Customer, product: Product,
  ): Promise<Buffer> {
    const customerName = customer.type === 'corporate'
      ? customer.companyName
      : `${customer.firstName} ${customer.lastName}`;

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 80, 40, 60],
      header: this.buildHeader('POLICY SCHEDULE'),
      footer: (currentPage: number, pageCount: number) =>
        this.buildFooter(currentPage, pageCount, policy.policyNumber),

      content: [
        { text: 'POLICY SCHEDULE', style: 'docTitle' },
        { text: `Policy Number: ${policy.policyNumber}`, style: 'policyNumber' },
        { text: ' ', margin: [0, 8] },

        this.sectionHeader('Policyholder Details'),
        {
          columns: [
            this.kvColumn([
              ['Name', customerName],
              ['Customer Number', customer.customerNumber],
              ['Email', customer.email],
            ]),
            this.kvColumn([
              ['Phone', customer.phone || '—'],
              ['ID Number', customer.idNumber || customer.registrationNumber || '—'],
              ['Address', [customer.addressLine1, customer.city].filter(Boolean).join(', ') || '—'],
            ]),
          ],
        },

        this.sectionHeader('Policy Details'),
        {
          columns: [
            this.kvColumn([
              ['Product', product.name],
              ['Policy Status', policy.status.toUpperCase()],
              ['Distribution Channel', policy.distributionChannel.replace(/_/g, ' ')],
            ]),
            this.kvColumn([
              ['Start Date', this.fmtDate(policy.startDate)],
              ['End Date', this.fmtDate(policy.endDate)],
              ['Currency', policy.currency],
            ]),
          ],
        },

        this.sectionHeader('Sum Insured & Premium'),
        {
          table: {
            widths: ['*', 'auto'],
            body: [
              [{ text: 'Sum Insured', style: 'tableLabel' }, { text: this.fmtMoney(policy.sumInsured, policy.currency), style: 'tableValue' }],
              [{ text: 'Net Premium', style: 'tableLabel' }, { text: this.fmtMoney(policy.netPremium, policy.currency), style: 'tableValue' }],
              [{ text: 'VAT / Tax', style: 'tableLabel' }, { text: this.fmtMoney(policy.taxAmount, policy.currency), style: 'tableValue' }],
              [{ text: 'Levy', style: 'tableLabel' }, { text: this.fmtMoney(policy.levyAmount, policy.currency), style: 'tableValue' }],
              [{ text: 'Gross Premium', style: 'tableLabelBold' }, { text: this.fmtMoney(policy.grossPremium, policy.currency), style: 'tableValueBold' }],
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 4, 0, 16],
        },

        ...(policy.beneficiaries?.length ? [
          this.sectionHeader('Beneficiaries'),
          {
            table: {
              widths: ['*', 'auto', 'auto'],
              body: [
                [{ text: 'Name', style: 'th' }, { text: 'Relationship', style: 'th' }, { text: '%', style: 'th' }],
                ...policy.beneficiaries.map(b => [b.name, b.relationship, `${b.percentage}%`]),
              ],
            },
            layout: 'lightHorizontalLines',
            margin: [0, 4, 0, 16],
          },
        ] : []),

        ...(product.coverageConfig?.exclusions?.length ? [
          this.sectionHeader('Key Exclusions'),
          { ul: product.coverageConfig.exclusions, style: 'bodyText', margin: [0, 4, 0, 16] },
        ] : []),

        { text: ' ', margin: [0, 16] },
        {
          text: 'This Policy Schedule forms part of the Policy Document and is subject to the terms, conditions, and exclusions contained therein. This document is system-generated and valid without signature.',
          style: 'disclaimer',
        },
      ],

      styles: this.sharedStyles(),
      defaultStyle: { font: 'Helvetica', fontSize: 10, color: BRAND.black },
    };

    return this.renderPdf(docDefinition);
  }

  // ── POLICY CERTIFICATE ──────────────────────────────────────────────────────

  async generateCertificate(
    policy: Policy, customer: Customer, product: Product,
  ): Promise<Buffer> {
    const customerName = customer.type === 'corporate'
      ? customer.companyName
      : `${customer.firstName} ${customer.lastName}`;

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 80, 40, 60],
      header: this.buildHeader('CERTIFICATE OF INSURANCE'),
      footer: (currentPage: number, pageCount: number) =>
        this.buildFooter(currentPage, pageCount, policy.policyNumber),

      content: [
        { text: 'CERTIFICATE OF INSURANCE', style: 'docTitle' },
        { text: ' ', margin: [0, 16] },
        {
          text: 'This is to certify that the following risk is insured with EBA Micro Insurance Company (Pvt) Ltd, subject to the terms, conditions, and exclusions of the policy referenced below.',
          style: 'bodyText', margin: [0, 0, 0, 24],
        },
        {
          table: {
            widths: ['40%', '60%'],
            body: [
              ['Insured Name', customerName],
              ['Policy Number', policy.policyNumber],
              ['Product', product.name],
              ['Sum Insured', this.fmtMoney(policy.sumInsured, policy.currency)],
              ['Period of Insurance', `${this.fmtDate(policy.startDate)} to ${this.fmtDate(policy.endDate)}`],
            ],
          },
          layout: 'lightHorizontalLines',
        },
        { text: ' ', margin: [0, 32] },
        {
          columns: [
            { text: 'Munyaradzi Chiondegwa', style: 'signature' },
            { text: this.fmtDate(new Date()), style: 'signature', alignment: 'right' },
          ],
        },
        {
          columns: [
            { text: 'Authorised Signatory — EBA Micro Insurance', style: 'signatureLabel' },
            { text: 'Date Issued', style: 'signatureLabel', alignment: 'right' },
          ],
        },
      ],

      styles: this.sharedStyles(),
      defaultStyle: { font: 'Helvetica', fontSize: 10, color: BRAND.black },
    };

    return this.renderPdf(docDefinition);
  }

  // ── ENDORSEMENT LETTER ──────────────────────────────────────────────────────

  async generateEndorsementLetter(
    endorsement: PolicyEndorsement, policy: Policy, customer: Customer,
  ): Promise<Buffer> {
    const customerName = customer.type === 'corporate'
      ? customer.companyName
      : `${customer.firstName} ${customer.lastName}`;

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 80, 40, 60],
      header: this.buildHeader('ENDORSEMENT LETTER'),
      footer: (currentPage: number, pageCount: number) =>
        this.buildFooter(currentPage, pageCount, endorsement.endorsementNumber),

      content: [
        { text: 'ENDORSEMENT LETTER', style: 'docTitle' },
        { text: `Endorsement Number: ${endorsement.endorsementNumber}`, style: 'policyNumber' },
        { text: ' ', margin: [0, 16] },
        {
          text: `Dear ${customerName},`, style: 'bodyText', margin: [0, 0, 0, 12],
        },
        {
          text: `This letter confirms the following endorsement applied to your policy ${policy.policyNumber}, effective ${this.fmtDate(endorsement.effectiveDate)}.`,
          style: 'bodyText', margin: [0, 0, 0, 16],
        },
        this.sectionHeader('Endorsement Type'),
        { text: endorsement.type.replace(/_/g, ' ').toUpperCase(), style: 'bodyText', margin: [0, 0, 0, 16] },

        ...(endorsement.reason ? [
          this.sectionHeader('Reason'),
          { text: endorsement.reason, style: 'bodyText', margin: [0, 0, 0, 16] },
        ] : []),

        this.sectionHeader('Premium Impact'),
        {
          table: {
            widths: ['*', 'auto'],
            body: [
              ['Additional Premium', this.fmtMoney(endorsement.additionalPremium, policy.currency)],
              ['Premium Refund', this.fmtMoney(endorsement.premiumRefund, policy.currency)],
            ],
          },
          layout: 'lightHorizontalLines',
        },
      ],

      styles: this.sharedStyles(),
      defaultStyle: { font: 'Helvetica', fontSize: 10, color: BRAND.black },
    };

    return this.renderPdf(docDefinition);
  }

  // ── SHARED BUILDING BLOCKS ──────────────────────────────────────────────────

  private buildHeader(docType: string) {
    return {
      margin: [40, 24, 40, 0],
      columns: [
        {
          width: '*',
          stack: [
            { text: 'EBA MICRO INSURANCE', style: 'brandName' },
            { text: 'Company (Pvt) Ltd — Regulated by IPEC Zimbabwe', style: 'brandSub' },
          ],
        },
        { text: docType, style: 'docTypeTag', alignment: 'right' },
      ],
    };
  }

  private buildFooter(currentPage: number, pageCount: number, ref: string) {
    return {
      margin: [40, 0, 40, 24],
      columns: [
        { text: `Ref: ${ref}`, style: 'footerText' },
        { text: `Page ${currentPage} of ${pageCount}`, style: 'footerText', alignment: 'center' },
        { text: 'eba-eimp.co.zw', style: 'footerText', alignment: 'right' },
      ],
    };
  }

  private sectionHeader(text: string) {
    return { text, style: 'sectionHeader' };
  }

  private kvColumn(pairs: [string, string][]) {
    return {
      width: '50%',
      stack: pairs.map(([k, v]) => ({
        columns: [
          { text: k, style: 'kvKey', width: 110 },
          { text: v, style: 'kvValue' },
        ],
        margin: [0, 2, 0, 2],
      })),
    };
  }

  private sharedStyles() {
    return {
      brandName: { fontSize: 14, bold: true, color: BRAND.red },
      brandSub: { fontSize: 8, color: BRAND.grey },
      docTypeTag: { fontSize: 10, bold: true, color: BRAND.black },
      docTitle: { fontSize: 18, bold: true, color: BRAND.black, margin: [0, 0, 0, 4] },
      policyNumber: { fontSize: 11, color: BRAND.red, bold: true },
      sectionHeader: { fontSize: 11, bold: true, color: BRAND.red, margin: [0, 12, 0, 6] },
      bodyText: { fontSize: 10, color: BRAND.black, lineHeight: 1.3 },
      kvKey: { fontSize: 9, color: BRAND.grey },
      kvValue: { fontSize: 9, color: BRAND.black, bold: true },
      th: { fontSize: 9, bold: true, color: BRAND.grey, fillColor: '#f5f5f5' },
      tableLabel: { fontSize: 9, color: BRAND.grey },
      tableValue: { fontSize: 9, color: BRAND.black, alignment: 'right' },
      tableLabelBold: { fontSize: 10, bold: true, color: BRAND.black },
      tableValueBold: { fontSize: 11, bold: true, color: BRAND.red, alignment: 'right' },
      signature: { fontSize: 11, italics: true },
      signatureLabel: { fontSize: 8, color: BRAND.grey, margin: [0, 2, 0, 0] },
      disclaimer: { fontSize: 7, color: BRAND.grey, italics: true, margin: [0, 8, 0, 0] },
      footerText: { fontSize: 7, color: BRAND.grey },
    };
  }

  private renderPdf(docDefinition: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
        const chunks: Buffer[] = [];
        pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
        pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
        pdfDoc.on('error', reject);
        pdfDoc.end();
      } catch (err) {
        this.logger.error(`PDF generation failed: ${err.message}`);
        reject(err);
      }
    });
  }

  private fmtDate(d: Date | string): string {
    return new Date(d).toLocaleDateString('en-ZW', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  private fmtMoney(amount: number, currency: string): string {
    return `${currency} ${Number(amount || 0).toLocaleString('en-ZW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

