-- Create port order status enum
DO $$ BEGIN
  CREATE TYPE "port_order_status" AS ENUM ('draft', 'submitted', 'in_process', 'exception', 'foc_date_confirmed', 'ported', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create port orders table
CREATE TABLE IF NOT EXISTS "portOrders" (
  "id" serial PRIMARY KEY NOT NULL,
  "customerId" integer NOT NULL,
  "telnyxPortOrderId" varchar(128),
  "portOrderStatus" "port_order_status" DEFAULT 'draft' NOT NULL,
  "phoneNumberIds" jsonb,
  "portPhoneNumbers" jsonb,
  "authorizedName" varchar(255),
  "businessName" varchar(255),
  "losingCarrier" varchar(255),
  "accountNumber" varchar(128),
  "accountPin" varchar(64),
  "streetAddress" varchar(255),
  "city" varchar(128),
  "state" varchar(64),
  "zip" varchar(16),
  "country" varchar(2) DEFAULT 'US',
  "focDate" timestamp,
  "activationDate" timestamp,
  "notes" text,
  "lastError" text,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
