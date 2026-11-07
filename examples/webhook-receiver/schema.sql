-- Merchant-side example schema. NOT an Briofold infrastructure migration.
CREATE TABLE merchant_orders(reference text PRIMARY KEY,amount_minor bigint NOT NULL CHECK(amount_minor>0));
CREATE TABLE merchant_webhook_events(event_id uuid PRIMARY KEY,payment_id uuid NOT NULL,reference text NOT NULL REFERENCES merchant_orders(reference),received_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE merchant_fulfilment_jobs(reference text PRIMARY KEY REFERENCES merchant_orders(reference),payment_id uuid NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now());
