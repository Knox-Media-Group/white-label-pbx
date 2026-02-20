-- Add planId to customers
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "planId" integer;

-- Create service plans table
CREATE TABLE IF NOT EXISTS "servicePlans" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(128) NOT NULL,
  "description" text,
  "monthlyPrice" integer DEFAULT 0,
  "includedMinutes" integer DEFAULT 0,
  "includedNumbers" integer DEFAULT 1,
  "includedEndpoints" integer DEFAULT 5,
  "includedSms" integer DEFAULT 0,
  "features" jsonb,
  "isActive" boolean DEFAULT true NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

-- Create SMS direction and status enums
DO $$ BEGIN
  CREATE TYPE "sms_direction" AS ENUM('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "sms_status" AS ENUM('queued', 'sent', 'delivered', 'failed', 'received');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Create SMS messages table
CREATE TABLE IF NOT EXISTS "smsMessages" (
  "id" serial PRIMARY KEY NOT NULL,
  "customerId" integer NOT NULL,
  "telnyxMessageId" varchar(128),
  "fromNumber" varchar(32) NOT NULL,
  "toNumber" varchar(32) NOT NULL,
  "body" text,
  "direction" "sms_direction" NOT NULL,
  "smsStatus" "sms_status" DEFAULT 'queued' NOT NULL,
  "mediaUrls" jsonb,
  "segments" integer DEFAULT 1,
  "errorCode" varchar(32),
  "errorMessage" text,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
