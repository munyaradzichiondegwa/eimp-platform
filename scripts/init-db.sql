-- EBA EIMP Database Initialisation
-- Run once on first startup via Docker entrypoint

-- Create extensions required by the application
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- Fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";    -- Composite GIN indexes
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- Encryption functions

-- Create schemas for logical separation
CREATE SCHEMA IF NOT EXISTS eimp;

-- Set default search path
ALTER DATABASE eimp_db SET search_path TO eimp, public;

-- Create audit log function (append-only enforcement)
CREATE OR REPLACE FUNCTION prevent_audit_update()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Audit log records are immutable and cannot be modified';
END;
$$ LANGUAGE plpgsql;

-- Note: TypeORM will create all tables via synchronize or migrations.
-- This script only sets up extensions and schemas.
