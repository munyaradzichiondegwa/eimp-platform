import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AppDataSource } from './data-source';
import { User, UserRole, UserStatus } from '../modules/users/entities/user.entity';
import { GlAccount, GlAccountType, GlAccountCategory } from '../modules/finance/entities/gl-account.entity';
import { Product, ProductType, ProductStatus, ProductPhase } from '../modules/underwriting/entities/product.entity';

const SYSTEM_ACCOUNTS = [
  { code: '1001', name: 'Cash on Hand', type: GlAccountType.ASSET, category: GlAccountCategory.CASH },
  { code: '1100', name: 'Bank Account — USD', type: GlAccountType.ASSET, category: GlAccountCategory.BANK },
  { code: '1110', name: 'Bank Account — ZiG', type: GlAccountType.ASSET, category: GlAccountCategory.BANK },
  { code: '1200', name: 'EcoCash Collections', type: GlAccountType.ASSET, category: GlAccountCategory.MOBILE_MONEY },
  { code: '1201', name: 'OneMoney Collections', type: GlAccountType.ASSET, category: GlAccountCategory.MOBILE_MONEY },
  { code: '1202', name: 'InnBucks Collections', type: GlAccountType.ASSET, category: GlAccountCategory.MOBILE_MONEY },
  { code: '1300', name: 'Premium Receivable', type: GlAccountType.ASSET, category: GlAccountCategory.PREMIUM_RECEIVABLE },
  { code: '1400', name: 'Reinsurance Recoverable', type: GlAccountType.ASSET, category: GlAccountCategory.REINSURANCE_RECOVERABLE },
  { code: '1500', name: 'Fixed Assets', type: GlAccountType.ASSET, category: GlAccountCategory.FIXED_ASSETS },
  { code: '2100', name: 'Claims Payable', type: GlAccountType.LIABILITY, category: GlAccountCategory.CLAIMS_PAYABLE },
  { code: '2200', name: 'Claims Reserve', type: GlAccountType.LIABILITY, category: GlAccountCategory.CLAIMS_RESERVE },
  { code: '2300', name: 'Unearned Premium Reserve', type: GlAccountType.LIABILITY, category: GlAccountCategory.UNEARNED_PREMIUM },
  { code: '2400', name: 'Accounts Payable', type: GlAccountType.LIABILITY, category: GlAccountCategory.ACCOUNTS_PAYABLE },
  { code: '2600', name: 'VAT Payable', type: GlAccountType.LIABILITY, category: GlAccountCategory.TAX_PAYABLE },
  { code: '2601', name: 'Income Tax Payable', type: GlAccountType.LIABILITY, category: GlAccountCategory.TAX_PAYABLE },
  { code: '4001', name: 'GWP — Credit Life', type: GlAccountType.REVENUE, category: GlAccountCategory.GROSS_WRITTEN_PREMIUM },
  { code: '4002', name: 'GWP — Health', type: GlAccountType.REVENUE, category: GlAccountCategory.GROSS_WRITTEN_PREMIUM },
  { code: '4003', name: 'GWP — Personal All Risks', type: GlAccountType.REVENUE, category: GlAccountCategory.GROSS_WRITTEN_PREMIUM },
  { code: '4004', name: 'GWP — Agriculture', type: GlAccountType.REVENUE, category: GlAccountCategory.GROSS_WRITTEN_PREMIUM },
  { code: '4005', name: 'GWP — Travel', type: GlAccountType.REVENUE, category: GlAccountCategory.GROSS_WRITTEN_PREMIUM },
  { code: '4100', name: 'Reinsurance Premium Ceded', type: GlAccountType.REVENUE, category: GlAccountCategory.REINSURANCE_PREMIUM },
  { code: '4200', name: 'Investment Income', type: GlAccountType.REVENUE, category: GlAccountCategory.INVESTMENT_INCOME },
  { code: '5001', name: 'Claims Incurred — Credit Life', type: GlAccountType.EXPENSE, category: GlAccountCategory.CLAIMS_INCURRED },
  { code: '5002', name: 'Claims Incurred — Health', type: GlAccountType.EXPENSE, category: GlAccountCategory.CLAIMS_INCURRED },
  { code: '5003', name: 'Claims Incurred — All Risks', type: GlAccountType.EXPENSE, category: GlAccountCategory.CLAIMS_INCURRED },
  { code: '5100', name: 'Broker Commission', type: GlAccountType.EXPENSE, category: GlAccountCategory.COMMISSION_EXPENSE },
  { code: '5200', name: 'Staff Costs', type: GlAccountType.EXPENSE, category: GlAccountCategory.MANAGEMENT_EXPENSE },
  { code: '5300', name: 'IT & Systems', type: GlAccountType.EXPENSE, category: GlAccountCategory.OPERATING_EXPENSE },
  { code: '5400', name: 'Marketing & Distribution', type: GlAccountType.EXPENSE, category: GlAccountCategory.OPERATING_EXPENSE },
  { code: '5500', name: 'Regulatory & Compliance', type: GlAccountType.EXPENSE, category: GlAccountCategory.OPERATING_EXPENSE },
];

async function seed() {
  let dataSource: DataSource;
  try {
    dataSource = await AppDataSource.initialize();
    console.log('Database connected for seeding...');

    // 1. Create Super Admin
    const userRepo = dataSource.getRepository(User);
    const existingAdmin = await userRepo.findOne({ where: { email: 'admin@ebamicroinsurance.co.zw' } });

    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash('EbaAdmin@2026!', 12);
      await userRepo.save(userRepo.create({
        firstName: 'System',
        lastName: 'Administrator',
        email: 'admin@ebamicroinsurance.co.zw',
        passwordHash,
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        department: 'IT',
      }));
      console.log('Super admin created: admin@ebamicroinsurance.co.zw / EbaAdmin@2026!');
    } else {
      console.log('Super admin already exists — skipped');
    }

    // 2. Seed Chart of Accounts
    const glRepo = dataSource.getRepository(GlAccount);
    const existingAccounts = await glRepo.count();

    if (existingAccounts === 0) {
      await glRepo.save(
        SYSTEM_ACCOUNTS.map((a) => glRepo.create({
          ...a, isSystemAccount: true, currency: 'USD', currentBalance: 0,
        })),
      );
      console.log(`Seeded ${SYSTEM_ACCOUNTS.length} GL accounts`);
    } else {
      console.log(`GL accounts already exist (${existingAccounts}) — skipped`);
    }

    // 3. Seed Insurance Products
    const productRepo = dataSource.getRepository(Product);
    const existingProducts = await productRepo.count();

    if (existingProducts === 0) {
      const products = [
        {
          code: 'CREDIT-LIFE-001',
          name: 'Credit Life Insurance',
          type: ProductType.CREDIT_LIFE,
          status: ProductStatus.ACTIVE,
          phase: ProductPhase.PHASE_1,
          description: 'Coverage for outstanding loan balance on death or permanent disability',
          premiumRules: {
            ratePerUnit: 0.5, minPremium: 2, maxPremium: 500, taxRate: 0, levyRate: 1,
            discounts: [], loadings: [],
          },
          coverageConfig: {
            minSumInsured: 100, maxSumInsured: 50000, currency: 'USD',
            waitingPeriodDays: 30, policyTermMonths: 12,
            exclusions: ['Pre-existing conditions', 'Suicide within 12 months', 'War and civil unrest'],
            benefitTypes: ['Death Benefit', 'Permanent Disability Benefit'],
          },
          underwritingRules: {
            minAge: 18, maxAge: 65, requiresMedical: false, medicalThreshold: 30000,
            autoApproveBelow: 20000, referralThreshold: 30000,
            requiredDocuments: ['national_id'],
          },
          allowedDistributionChannels: ['direct', 'broker', 'portal', 'mobile'],
          isBrokerSellable: true,
          brokerCommissionRate: 10,
          isPortalSellable: true,
          activatedAt: new Date(),
          ipecDetails: { classOfBusiness: 'Life', licenseRef: 'IPEC/LIFE/001' },
        },
        {
          code: 'HEALTH-001',
          name: 'Health Insurance',
          type: ProductType.HEALTH,
          status: ProductStatus.ACTIVE,
          phase: ProductPhase.PHASE_1,
          description: 'Inpatient and outpatient medical coverage',
          premiumRules: {
            premiumBands: [
              { minSumInsured: 500, maxSumInsured: 2000, rate: 8 },
              { minSumInsured: 2001, maxSumInsured: 5000, rate: 7 },
              { minSumInsured: 5001, maxSumInsured: 20000, rate: 6 },
            ],
            minPremium: 50, taxRate: 0, levyRate: 1, discounts: [], loadings: [],
          },
          coverageConfig: {
            minSumInsured: 500, maxSumInsured: 20000, currency: 'USD',
            waitingPeriodDays: 60, policyTermMonths: 12,
            coverageItems: [
              { name: 'Inpatient', included: true },
              { name: 'Outpatient', included: true, sublimit: 500 },
              { name: 'Maternity', included: true, sublimit: 2000 },
              { name: 'Dental', included: false },
            ],
            exclusions: ['Cosmetic surgery', 'Fertility treatment', 'Pre-existing conditions (first year)'],
          },
          underwritingRules: {
            minAge: 1, maxAge: 70, requiresMedical: false, medicalThreshold: 10000,
            autoApproveBelow: 5000, referralThreshold: 10000,
            requiredDocuments: ['national_id'],
          },
          allowedDistributionChannels: ['direct', 'broker', 'portal'],
          isBrokerSellable: true,
          brokerCommissionRate: 12,
          isPortalSellable: true,
          activatedAt: new Date(),
          ipecDetails: { classOfBusiness: 'Health', licenseRef: 'IPEC/HEALTH/001' },
        },
        {
          code: 'PAR-001',
          name: 'Personal All Risks Insurance',
          type: ProductType.PERSONAL_ALL_RISKS,
          status: ProductStatus.ACTIVE,
          phase: ProductPhase.PHASE_1,
          description: 'Portable personal property coverage (phones, laptops, jewellery)',
          premiumRules: {
            ratePerUnit: 3, minPremium: 5, maxPremium: 200, taxRate: 15, levyRate: 1,
            discounts: [], loadings: [],
          },
          coverageConfig: {
            minSumInsured: 50, maxSumInsured: 5000, currency: 'USD',
            waitingPeriodDays: 0, policyTermMonths: 12,
            exclusions: ['Wear and tear', 'Intentional damage', 'Unattended items in vehicles'],
          },
          underwritingRules: {
            minAge: 18, maxAge: 100, autoApproveBelow: 2000, referralThreshold: 3000,
            requiredDocuments: ['national_id', 'proof_of_ownership'],
          },
          allowedDistributionChannels: ['direct', 'broker', 'portal', 'mobile'],
          isBrokerSellable: true,
          brokerCommissionRate: 15,
          isPortalSellable: true,
          activatedAt: new Date(),
          ipecDetails: { classOfBusiness: 'Non-Life', licenseRef: 'IPEC/GEN/001' },
        },
      ];

      for (const p of products) {
        await productRepo.save(productRepo.create(p));
      }
      console.log(`Seeded ${products.length} insurance products`);
    } else {
      console.log(`Products already exist (${existingProducts}) — skipped`);
    }

    console.log('\nSeed complete.');
    console.log('Login: admin@ebamicroinsurance.co.zw / EbaAdmin@2026!');
    console.log('IMPORTANT: Change the default password immediately on first login.');

  } catch (error) {
    console.error('Seed failed:', error.message);
    throw error;
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy();
  }
}

seed();
