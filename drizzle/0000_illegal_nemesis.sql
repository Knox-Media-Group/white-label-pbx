CREATE TYPE "public"."active_inactive" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."call_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."customer_status" AS ENUM('active', 'suspended', 'pending', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."destination_type" AS ENUM('endpoint', 'ring_group', 'external', 'voicemail', 'ai_agent');--> statement-breakpoint
CREATE TYPE "public"."failover_action" AS ENUM('voicemail', 'forward', 'hangup');--> statement-breakpoint
CREATE TYPE "public"."http_method" AS ENUM('GET', 'POST');--> statement-breakpoint
CREATE TYPE "public"."match_type" AS ENUM('all', 'caller_id', 'time_based', 'did');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('missed_call', 'voicemail', 'high_volume', 'system', 'recording_ready');--> statement-breakpoint
CREATE TYPE "public"."phone_call_handler" AS ENUM('laml_webhooks', 'relay_context', 'relay_topic', 'ai_agent', 'sip_endpoint', 'ring_group');--> statement-breakpoint
CREATE TYPE "public"."phone_status" AS ENUM('active', 'inactive', 'porting');--> statement-breakpoint
CREATE TYPE "public"."recording_status" AS ENUM('processing', 'ready', 'failed', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."ring_group_strategy" AS ENUM('simultaneous', 'sequential', 'round_robin', 'random');--> statement-breakpoint
CREATE TYPE "public"."sip_call_handler" AS ENUM('laml_webhooks', 'relay_context', 'relay_topic', 'ai_agent', 'video_room');--> statement-breakpoint
CREATE TYPE "public"."sip_endpoint_status" AS ENUM('active', 'inactive', 'provisioning');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "callRecordings" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"callSid" varchar(64),
	"direction" "call_direction" NOT NULL,
	"fromNumber" varchar(32),
	"toNumber" varchar(32),
	"duration" integer,
	"recordingUrl" text,
	"recordingKey" varchar(255),
	"transcription" text,
	"summary" text,
	"recordingStatus" "recording_status" DEFAULT 'processing' NOT NULL,
	"retentionDays" integer DEFAULT 90,
	"expiresAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "callRoutes" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"priority" integer DEFAULT 0,
	"matchType" "match_type" DEFAULT 'all' NOT NULL,
	"matchPattern" varchar(128),
	"timeStart" varchar(8),
	"timeEnd" varchar(8),
	"daysOfWeek" jsonb,
	"destinationType" "destination_type" DEFAULT 'endpoint' NOT NULL,
	"destinationId" integer,
	"destinationExternal" varchar(128),
	"callRouteStatus" "active_inactive" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"companyName" varchar(255),
	"email" varchar(320) NOT NULL,
	"phone" varchar(32),
	"status" "customer_status" DEFAULT 'pending' NOT NULL,
	"telnyxApiKey" varchar(64),
	"telnyxApiToken" text,
	"telnyxConnectionId" varchar(255),
	"brandingLogo" text,
	"brandingPrimaryColor" varchar(7) DEFAULT '#6366f1',
	"brandingCompanyName" varchar(255),
	"portalUsername" varchar(64),
	"portalPasswordHash" text,
	"notes" text,
	"smsSummaryEnabled" boolean DEFAULT true,
	"notificationPhone" varchar(32),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_portalUsername_unique" UNIQUE("portalUsername")
);
--> statement-breakpoint
CREATE TABLE "llmCallFlows" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"naturalLanguageConfig" text,
	"generatedLaml" text,
	"isActive" boolean DEFAULT false,
	"lastGeneratedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"username" varchar(64) NOT NULL,
	"passwordHash" text NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"lastLoginAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "local_credentials_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "notificationSettings" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"missedCallEmail" boolean DEFAULT true,
	"missedCallInApp" boolean DEFAULT true,
	"voicemailEmail" boolean DEFAULT true,
	"voicemailInApp" boolean DEFAULT true,
	"highVolumeEmail" boolean DEFAULT false,
	"highVolumeInApp" boolean DEFAULT true,
	"highVolumeThreshold" integer DEFAULT 100,
	"recordingReadyEmail" boolean DEFAULT false,
	"recordingReadyInApp" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notificationSettings_customerId_unique" UNIQUE("customerId")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"userId" integer,
	"type" "notification_type" NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text,
	"metadata" jsonb,
	"isRead" boolean DEFAULT false,
	"emailSent" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phoneNumbers" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"telnyxPhoneNumberId" varchar(64),
	"phoneNumber" varchar(32) NOT NULL,
	"friendlyName" varchar(128),
	"voiceEnabled" boolean DEFAULT true,
	"smsEnabled" boolean DEFAULT false,
	"faxEnabled" boolean DEFAULT false,
	"assignedToEndpointId" integer,
	"assignedToRingGroupId" integer,
	"callHandler" "phone_call_handler" DEFAULT 'laml_webhooks',
	"callRequestUrl" text,
	"callRelayContext" varchar(64),
	"status" "phone_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retentionPolicies" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"defaultRetentionDays" integer DEFAULT 90,
	"autoDeleteEnabled" boolean DEFAULT true,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "retentionPolicies_customerId_unique" UNIQUE("customerId")
);
--> statement-breakpoint
CREATE TABLE "ringGroups" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"extensionNumber" varchar(16),
	"strategy" "ring_group_strategy" DEFAULT 'simultaneous' NOT NULL,
	"ringTimeout" integer DEFAULT 30,
	"memberEndpointIds" jsonb,
	"failoverAction" "failover_action" DEFAULT 'voicemail',
	"failoverDestination" varchar(128),
	"status" "active_inactive" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sipEndpoints" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"telnyxEndpointId" varchar(64),
	"username" varchar(64) NOT NULL,
	"password" text,
	"callerId" varchar(64),
	"sendAs" varchar(32),
	"displayName" varchar(128),
	"extensionNumber" varchar(16),
	"status" "sip_endpoint_status" DEFAULT 'provisioning' NOT NULL,
	"callHandler" "sip_call_handler" DEFAULT 'laml_webhooks',
	"callRequestUrl" text,
	"callRequestMethod" "http_method" DEFAULT 'POST',
	"callRelayContext" varchar(64),
	"callAiAgentId" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usageStats" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"periodStart" timestamp NOT NULL,
	"periodEnd" timestamp NOT NULL,
	"totalCalls" integer DEFAULT 0,
	"inboundCalls" integer DEFAULT 0,
	"outboundCalls" integer DEFAULT 0,
	"totalMinutes" integer DEFAULT 0,
	"missedCalls" integer DEFAULT 0,
	"activeEndpoints" integer DEFAULT 0,
	"activePhoneNumbers" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"customerId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
