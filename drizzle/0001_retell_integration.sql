-- Add Telnyx fields to customers table
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "telnyxConnectionId" varchar(64);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "telnyxApiKey" text;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "telnyxMessagingProfileId" varchar(255);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "retellApiKey" text;

-- Add Telnyx credential ID to SIP endpoints
ALTER TABLE "sipEndpoints" ADD COLUMN IF NOT EXISTS "telnyxCredentialId" varchar(64);

-- Add Telnyx phone number ID and Retell agent ID to phone numbers
ALTER TABLE "phoneNumbers" ADD COLUMN IF NOT EXISTS "telnyxPhoneNumberId" varchar(64);
ALTER TABLE "phoneNumbers" ADD COLUMN IF NOT EXISTS "callControlAppId" varchar(64);
ALTER TABLE "phoneNumbers" ADD COLUMN IF NOT EXISTS "retellAgentId" varchar(128);

-- Create system settings table
CREATE TABLE IF NOT EXISTS "systemSettings" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" varchar(128) NOT NULL,
  "value" text,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "systemSettings_key_unique" UNIQUE("key")
);

-- Create Retell agents table
CREATE TABLE IF NOT EXISTS "retellAgents" (
  "id" serial PRIMARY KEY NOT NULL,
  "customerId" integer NOT NULL,
  "retellAgentId" varchar(128) NOT NULL,
  "agentName" varchar(255) NOT NULL,
  "voiceId" varchar(128),
  "llmId" varchar(128),
  "webhookUrl" text,
  "status" "active_inactive" DEFAULT 'active' NOT NULL,
  "lastSyncedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
