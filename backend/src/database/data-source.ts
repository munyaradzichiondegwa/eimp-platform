import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || process.env.POSTGRES_USER || 'eimp_user',
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'eimp_secure_password',
  database: process.env.DB_NAME || process.env.POSTGRES_DB || 'eimp_db',
  entities: [join(__dirname, '../**/*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations/*.{ts,js}')],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  schema: 'eimp',
});
