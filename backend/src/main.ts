import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error', 'debug'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port') || 3001;
  const env = config.get<string>('app.env') || 'development';
  const apiPrefix = config.get<string>('app.apiPrefix') || 'api/v1';

  // ── SECURITY ───────────────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: env === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS — restrict to known origins in production
  app.enableCors({
    origin: env === 'production'
      ? [
          'https://portal.ebamicroinsurance.co.zw',
          'https://admin.ebamicroinsurance.co.zw',
          'https://broker.ebamicroinsurance.co.zw',
        ]
      : ['http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-ID'],
    credentials: true,
  });

  // ── MIDDLEWARE ─────────────────────────────────────────────────────────────
  app.use(compression());

  // ── GLOBAL PIPES & FILTERS ─────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,         // Strip unknown properties
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── API PREFIX ─────────────────────────────────────────────────────────────
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['health', '/'],
  });

  // ── SWAGGER / OpenAPI 3.0 ──────────────────────────────────────────────────
  if (env !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('EBA EIMP API')
      .setDescription(
        'Enterprise Insurance Management Platform — EBA Micro Insurance Company (Pvt) Ltd\n\n' +
        'Prepared by NevTech Consultancy | Ref: NTC/EBA/2026/002\n\n' +
        'All endpoints require Bearer JWT authentication unless marked as Public.',
      )
      .setVersion('2.0')
      .setContact('NevTech Consultancy', 'https://nevtechconsultancy.co.zw', 'chiondegwabm@gmail.com')
      .setLicense('PROPRIETARY', '')
      .addBearerAuth()
      .addTag('Authentication', 'Login, token refresh, password management')
      .addTag('Users', 'Platform user management and RBAC')
      .addTag('CRM — Customers', 'Customer records, KYC, communications')
      .addTag('Underwriting & Policy Administration', 'Products, quotations, policy lifecycle')
      .addTag('Claims Management', 'FNOL, workflow, reserves, fraud detection, settlement')
      .addTag('Finance & Accounting', 'GL, AR/AP, payments, financial statements')
      .addTag('Payments — Mobile Money & Gateway', 'EcoCash, OneMoney, InnBucks integrations')
      .addTag('Reporting & Compliance', 'Management reports, IPEC/ZIMRA/FIU regulatory returns')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
    logger.log(`Swagger UI: http://localhost:${port}/${apiPrefix}/docs`);
  }

  // ── HEALTH CHECK ───────────────────────────────────────────────────────────
  app.getHttpAdapter().get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'EBA EIMP API',
      version: '2.0',
      environment: env,
    });
  });

  app.getHttpAdapter().get('/', (req, res) => {
    res.json({
      service: 'EBA Micro Insurance — Enterprise Insurance Management Platform',
      version: '2.0',
      docs: env !== 'production' ? `/${apiPrefix}/docs` : 'Contact administrator',
      status: 'operational',
    });
  });

  // ── GRACEFUL SHUTDOWN ─────────────────────────────────────────────────────
  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`EIMP API started on port ${port} [${env.toUpperCase()}]`);
  logger.log(`API base: http://localhost:${port}/${apiPrefix}`);
}

bootstrap().catch((err) => {
  logger.error('Failed to bootstrap application', err);
  process.exit(1);
});
