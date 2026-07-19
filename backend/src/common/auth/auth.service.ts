import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User, UserStatus, UserRole } from '../../modules/users/entities/user.entity';
import { Customer, CustomerType, KycStatus, CustomerStatus } from '../../modules/crm/entities/customer.entity';
import { AuditService } from '../../modules/audit/audit.service';
import { AuditAction } from '../../modules/audit/entities/audit-log.entity';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { JwtPayload } from './jwt.strategy';

const PASSWORD_RESET_EXPIRY_MINUTES = 30;
const EMAIL_VERIFICATION_EXPIRY_HOURS = 48;

export interface RegisterCustomerDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  idNumber?: string;
  type?: CustomerType;
  companyName?: string;
}

export interface LoginDto {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    mfaEnabled: boolean;
    emailVerified: boolean;
  };
  requiresMfa?: boolean;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 30;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
    private notificationsService: NotificationsService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: email.toLowerCase() })
      .getOne();

    if (!user) return null;

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    return isPasswordValid ? user : null;
  }

  /**
   * CP-01: Customer self-registration. Creates a platform login (role=customer)
   * and a linked CRM Customer record in one step, then auto-logs the customer
   * in. If an existing staff-created Customer record matches by email and has
   * no portal login yet, it is linked rather than duplicated — this is the
   * common case where staff captured a customer manually before the portal
   * existed, and the customer later signs up for self-service access.
   */
  async registerCustomer(dto: RegisterCustomerDto, ipAddress?: string): Promise<AuthResponse> {
    const email = dto.email.toLowerCase();

    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new BadRequestException('An account with this email already exists. Please log in instead.');
    }

    if (dto.password.length < 10) {
      throw new BadRequestException('Password must be at least 10 characters');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const { rawToken: verificationToken, hashedToken: hashedVerificationToken } = this.generateSecureToken();
    const emailVerificationExpiry = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000);

    const user = this.userRepository.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email,
      passwordHash,
      phone: dto.phone,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      emailVerified: false,
      emailVerificationToken: hashedVerificationToken,
      emailVerificationExpiry,
    });
    const savedUser = await this.userRepository.save(user);

    // Link to an existing staff-created CRM record by email, or create a new one
    let customer = await this.customerRepository.findOne({ where: { email, userId: IsNull() } });

    if (customer) {
      customer.userId = savedUser.id;
      await this.customerRepository.save(customer);
    } else {
      const count = await this.customerRepository.count();
      customer = this.customerRepository.create({
        customerNumber: `EBA-C-${String(count + 1).padStart(6, '0')}`,
        type: dto.type || CustomerType.INDIVIDUAL,
        firstName: dto.firstName,
        lastName: dto.lastName,
        companyName: dto.companyName,
        email,
        phone: dto.phone,
        idNumber: dto.idNumber,
        kycStatus: KycStatus.NOT_SUBMITTED,
        status: CustomerStatus.ACTIVE,
        userId: savedUser.id,
      });
      await this.customerRepository.save(customer);
    }

    const tokens = await this.generateTokens(savedUser);
    await this.userRepository.update(savedUser.id, {
      lastLogin: new Date(),
      refreshToken: await bcrypt.hash(tokens.refreshToken, 10),
    });

    await this.sendVerificationEmail(savedUser.email, savedUser.firstName, verificationToken, 'customer');

    await this.auditService.log({
      action: AuditAction.CREATE,
      userId: savedUser.id,
      userEmail: email,
      entityType: 'customer_self_registration',
      entityId: customer.id,
      entityRef: customer.customerNumber,
      description: `Customer self-registered via portal: ${email}`,
      ipAddress,
      module: 'auth',
    });

    return {
      ...tokens,
      user: {
        id: savedUser.id,
        email: savedUser.email,
        firstName: savedUser.firstName,
        lastName: savedUser.lastName,
        role: savedUser.role,
        mfaEnabled: savedUser.mfaEnabled,
        emailVerified: false,
      },
    };
  }

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string): Promise<AuthResponse> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: dto.email.toLowerCase() })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check account lock
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesRemaining = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new UnauthorizedException(
        `Account locked. Try again in ${minutesRemaining} minutes.`,
      );
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Account suspended. Contact your administrator.');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      await this.handleFailedLogin(user);
      await this.auditService.log({
        action: AuditAction.LOGIN_FAILED,
        userId: user.id,
        userEmail: user.email,
        description: `Failed login attempt for ${user.email}`,
        ipAddress,
        userAgent,
        module: 'auth',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed attempts on successful password
    if (user.failedLoginAttempts > 0) {
      await this.userRepository.update(user.id, {
        failedLoginAttempts: 0,
        lockedUntil: null,
      });
    }

    // MFA check
    if (user.mfaEnabled && !dto.mfaCode) {
      return {
        accessToken: '',
        refreshToken: '',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          mfaEnabled: true,
          emailVerified: user.emailVerified,
        },
        requiresMfa: true,
      };
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Update last login and refresh token
    await this.userRepository.update(user.id, {
      lastLogin: new Date(),
      refreshToken: await bcrypt.hash(tokens.refreshToken, 10),
    });

    await this.auditService.log({
      action: AuditAction.LOGIN,
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      description: `Successful login for ${user.email}`,
      ipAddress,
      userAgent,
      module: 'auth',
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
        emailVerified: user.emailVerified,
      },
    };
  }

  async refreshTokens(userId: string, refreshToken: string): Promise<AuthResponse> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.refreshToken')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Access denied');
    }

    const isTokenValid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isTokenValid) {
      throw new UnauthorizedException('Access denied');
    }

    const tokens = await this.generateTokens(user);
    await this.userRepository.update(user.id, {
      refreshToken: await bcrypt.hash(tokens.refreshToken, 10),
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
        emailVerified: user.emailVerified,
      },
    };
  }

  async logout(userId: string): Promise<void> {
    await this.userRepository.update(userId, { refreshToken: null });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) throw new NotFoundException('User not found');

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) throw new BadRequestException('Current password is incorrect');

    if (newPassword.length < 10) {
      throw new BadRequestException('Password must be at least 10 characters');
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await this.userRepository.update(userId, { passwordHash: newHash });

    await this.auditService.log({
      action: AuditAction.PASSWORD_CHANGE,
      userId,
      description: 'User changed their password',
      module: 'auth',
    });
  }

  // ── EMAIL VERIFICATION ────────────────────────────────────────────────────

  async verifyEmail(rawToken: string): Promise<{ verified: boolean }> {
    const hashedToken = this.hashToken(rawToken);

    const user = await this.userRepository.findOne({ where: { emailVerificationToken: hashedToken } });
    if (!user || !user.emailVerificationExpiry || user.emailVerificationExpiry < new Date()) {
      throw new BadRequestException('This verification link is invalid or has expired. Request a new one.');
    }

    await this.userRepository.update(user.id, {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiry: null,
    });

    await this.auditService.log({
      action: AuditAction.UPDATE,
      userId: user.id,
      userEmail: user.email,
      description: `Email verified: ${user.email}`,
      module: 'auth',
    });

    return { verified: true };
  }

  async resendVerificationEmail(userId: string): Promise<{ sent: boolean }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.emailVerified) {
      throw new BadRequestException('This email address is already verified.');
    }

    const { rawToken, hashedToken } = this.generateSecureToken();
    const emailVerificationExpiry = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_HOURS * 60 * 60 * 1000);

    await this.userRepository.update(user.id, {
      emailVerificationToken: hashedToken,
      emailVerificationExpiry,
    });

    await this.sendVerificationEmail(user.email, user.firstName, rawToken, user.role === UserRole.CUSTOMER ? 'customer' : 'staff');
    return { sent: true };
  }

  // ── PASSWORD RESET ────────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<{ message: string }> {
    const genericResponse = {
      message: 'If an account exists with that email, a password reset link has been sent.',
    };

    const user = await this.userRepository.findOne({ where: { email: email.toLowerCase() } });
    if (!user) {
      this.logger.log(`Password reset requested for unregistered email: ${email}`);
      return genericResponse;
    }

    const { rawToken, hashedToken } = this.generateSecureToken();
    const passwordResetExpiry = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000);

    await this.userRepository.update(user.id, {
      passwordResetToken: hashedToken,
      passwordResetExpiry,
    });

    await this.sendPasswordResetEmail(user.email, user.firstName, rawToken, user.role === UserRole.CUSTOMER ? 'customer' : 'staff');

    await this.auditService.log({
      action: AuditAction.SYSTEM,
      userId: user.id,
      userEmail: user.email,
      description: `Password reset requested for ${user.email}`,
      module: 'auth',
    });

    return genericResponse;
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    if (newPassword.length < 10) {
      throw new BadRequestException('Password must be at least 10 characters');
    }

    const hashedToken = this.hashToken(rawToken);
    const user = await this.userRepository.findOne({ where: { passwordResetToken: hashedToken } });

    if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
      throw new BadRequestException('This reset link is invalid or has expired. Request a new one.');
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    await this.userRepository.update(user.id, {
      passwordHash: newHash,
      passwordResetToken: null,
      passwordResetExpiry: null,
      refreshToken: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    await this.auditService.log({
      action: AuditAction.PASSWORD_CHANGE,
      userId: user.id,
      userEmail: user.email,
      description: `Password reset completed for ${user.email}`,
      module: 'auth',
    });
  }

  // ── TOKEN HELPERS ─────────────────────────────────────────────────────────

  private generateSecureToken(): { rawToken: string; hashedToken: string } {
    const rawToken = crypto.randomBytes(32).toString('hex');
    return { rawToken, hashedToken: this.hashToken(rawToken) };
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private async sendVerificationEmail(
    email: string, firstName: string, rawToken: string, audience: 'customer' | 'staff',
  ): Promise<void> {
    const baseUrl = audience === 'customer'
      ? this.configService.get<string>('app.customerPortalUrl')
      : this.configService.get<string>('app.adminPortalUrl');
    const link = `${baseUrl}/verify-email?token=${rawToken}`;

    this.logger.log(`Email verification link for ${email}: ${link}`);

    const result = await this.notificationsService.sendEmail({
      to: email,
      subject: 'Verify your email — EBA Micro Insurance',
      html: `<p>Hi ${firstName},</p><p>Please confirm your email address by clicking the link below. This link expires in ${EMAIL_VERIFICATION_EXPIRY_HOURS} hours.</p><p><a href="${link}">Verify my email</a></p><p>If you didn't create this account, you can ignore this message.</p>`,
      text: `Hi ${firstName}, verify your email: ${link} (expires in ${EMAIL_VERIFICATION_EXPIRY_HOURS} hours)`,
    });

    if (!result.success) {
      this.logger.warn(`Verification email to ${email} could not be sent (${result.error}). The link above remains valid — share it manually if needed.`);
    }
  }

  private async sendPasswordResetEmail(
    email: string, firstName: string, rawToken: string, audience: 'customer' | 'staff',
  ): Promise<void> {
    const baseUrl = audience === 'customer'
      ? this.configService.get<string>('app.customerPortalUrl')
      : this.configService.get<string>('app.adminPortalUrl');
    const link = `${baseUrl}/reset-password?token=${rawToken}`;

    this.logger.log(`Password reset link for ${email}: ${link}`);

    const result = await this.notificationsService.sendEmail({
      to: email,
      subject: 'Reset your password — EBA Micro Insurance',
      html: `<p>Hi ${firstName},</p><p>We received a request to reset your password. This link expires in ${PASSWORD_RESET_EXPIRY_MINUTES} minutes.</p><p><a href="${link}">Reset my password</a></p><p>If you didn't request this, you can safely ignore this message — your password will not be changed.</p>`,
      text: `Hi ${firstName}, reset your password: ${link} (expires in ${PASSWORD_RESET_EXPIRY_MINUTES} minutes)`,
    });

    if (!result.success) {
      this.logger.warn(`Password reset email to ${email} could not be sent (${result.error}). The link above remains valid — share it manually if needed.`);
    }
  }

  private async generateTokens(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('app.jwtSecret'),
        expiresIn: this.configService.get<string>('app.jwtExpiry') || '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('app.jwtSecret') + '_refresh',
        expiresIn: this.configService.get<string>('app.jwtRefreshExpiry') || '7d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async handleFailedLogin(user: User): Promise<void> {
    const newAttempts = (user.failedLoginAttempts || 0) + 1;
    const updateData: Partial<User> = { failedLoginAttempts: newAttempts };

    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + LOCK_DURATION_MINUTES);
      updateData.lockedUntil = lockUntil;
    }

    await this.userRepository.update(user.id, updateData);
  }
}
