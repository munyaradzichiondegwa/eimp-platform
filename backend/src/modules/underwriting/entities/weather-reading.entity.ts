import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, Index,
} from 'typeorm';

export enum WeatherMetric {
  RAINFALL_MM = 'rainfall_mm',
  TEMPERATURE_C = 'temperature_c',
  SOIL_MOISTURE_PCT = 'soil_moisture_pct',
  DROUGHT_INDEX = 'drought_index',
}

@Entity('weather_readings')
@Index(['stationId', 'readingDate', 'metric'], { unique: true })
export class WeatherReading {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  @Index()
  stationId: string;

  @Column({ type: 'date' })
  @Index()
  readingDate: Date;

  @Column({ type: 'enum', enum: WeatherMetric })
  metric: WeatherMetric;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  value: number;

  @Column({ nullable: true, length: 50 })
  source: string;  // 'zimmet', 'manual', provider name

  @Column({ default: false })
  isAnomaly: boolean;  // Flagged if value is outside plausible range

  @Column({ type: 'jsonb', nullable: true })
  rawPayload: Record<string, any>;  // Original provider response, for audit

  @CreateDateColumn()
  ingestedAt: Date;
}
