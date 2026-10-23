-- R20 expand storage only. Run inside a transaction holding the DDL advisory lock.
CREATE TABLE IF NOT EXISTS opendesk_cc_schema (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version integer NOT NULL
);
INSERT INTO opendesk_cc_schema (singleton, version) VALUES (true, 1)
  ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS opendesk_cc_ledgers (
  ledger_id text PRIMARY KEY CHECK (length(ledger_id) BETWEEN 1 AND 128),
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
  credentials jsonb NOT NULL CHECK (jsonb_typeof(credentials) = 'object')
);
CREATE TABLE IF NOT EXISTS opendesk_cc_jobs (
  ledger_id text NOT NULL REFERENCES opendesk_cc_ledgers ON DELETE CASCADE,
  key text NOT NULL,
  body jsonb NOT NULL CHECK (jsonb_typeof(body) = 'object'
    AND NOT (body ? 'assignment') AND NOT (body ? 'receipt')),
  PRIMARY KEY (ledger_id, key)
);
CREATE TABLE IF NOT EXISTS opendesk_cc_assignments (
  ledger_id text NOT NULL,
  key text NOT NULL,
  body jsonb NOT NULL CHECK (jsonb_typeof(body) = 'object'
    AND body ? 'executorId' AND jsonb_typeof(body->'executorId') = 'string' AND length(body->>'executorId') > 0),
  dispatch_slot text,
  PRIMARY KEY (ledger_id, key),
  FOREIGN KEY (ledger_id, key) REFERENCES opendesk_cc_jobs ON DELETE CASCADE,
  CONSTRAINT opendesk_cc_dispatch_slot UNIQUE (ledger_id, dispatch_slot),
  CHECK (dispatch_slot IS NULL OR dispatch_slot = body->>'executorId')
);
CREATE TABLE IF NOT EXISTS opendesk_cc_receipts (
  ledger_id text NOT NULL,
  key text NOT NULL,
  body jsonb NOT NULL CHECK (jsonb_typeof(body) = 'object'),
  PRIMARY KEY (ledger_id, key),
  FOREIGN KEY (ledger_id, key) REFERENCES opendesk_cc_assignments ON DELETE CASCADE
);
-- Validate every new Receipt, including direct SQL on previously created tables.
-- Historical rows are not rewritten or promoted into retirement proof.
CREATE OR REPLACE FUNCTION opendesk_cc_check_receipt_retirement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.body #> '{result,retirementState}') IS DISTINCT FROM '"released"'::jsonb THEN
    RAISE EXCEPTION 'E_RECEIPT_RETIREMENT';
  END IF;
  RETURN NEW;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'opendesk_cc_receipt_retirement'
    AND tgrelid = 'opendesk_cc_receipts'::regclass) THEN
    CREATE TRIGGER opendesk_cc_receipt_retirement BEFORE INSERT OR UPDATE ON opendesk_cc_receipts
      FOR EACH ROW EXECUTE FUNCTION opendesk_cc_check_receipt_retirement();
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS opendesk_cc_requests (
  ledger_id text NOT NULL REFERENCES opendesk_cc_ledgers ON DELETE CASCADE,
  key text NOT NULL,
  body jsonb NOT NULL CHECK (jsonb_typeof(body) = 'object'
    AND jsonb_typeof(body->'digest') = 'string' AND body ? 'answer'),
  PRIMARY KEY (ledger_id, key)
);
CREATE TABLE IF NOT EXISTS opendesk_cc_executors (
  ledger_id text NOT NULL REFERENCES opendesk_cc_ledgers ON DELETE CASCADE,
  key text NOT NULL, body jsonb NOT NULL, PRIMARY KEY (ledger_id, key)
);
CREATE TABLE IF NOT EXISTS opendesk_cc_client_bindings (
  ledger_id text NOT NULL REFERENCES opendesk_cc_ledgers ON DELETE CASCADE,
  key text NOT NULL, body jsonb NOT NULL, PRIMARY KEY (ledger_id, key)
);
CREATE TABLE IF NOT EXISTS opendesk_cc_task_pins (
  ledger_id text NOT NULL REFERENCES opendesk_cc_ledgers ON DELETE CASCADE,
  key text NOT NULL, body jsonb NOT NULL, PRIMARY KEY (ledger_id, key)
);
CREATE TABLE IF NOT EXISTS opendesk_cc_outbox (
  ledger_id text NOT NULL REFERENCES opendesk_cc_ledgers ON DELETE CASCADE,
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  executor_id text, job_id text, kind text NOT NULL
);
CREATE INDEX IF NOT EXISTS opendesk_cc_outbox_cursor ON opendesk_cc_outbox (ledger_id, sequence);
CREATE TABLE IF NOT EXISTS opendesk_cc_audit (
  ledger_id text NOT NULL REFERENCES opendesk_cc_ledgers ON DELETE CASCADE,
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL, changed_keys jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Defense in depth for immutable history, including writes outside the adapter.
-- Removing the parent ledger is reserved for explicit ledger/test cleanup.
CREATE OR REPLACE FUNCTION opendesk_cc_guard_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS
    (SELECT 1 FROM opendesk_cc_ledgers WHERE ledger_id = OLD.ledger_id) THEN
    RETURN OLD;
  END IF;
  IF TG_TABLE_NAME = 'opendesk_cc_ledgers' THEN
    IF NEW.ledger_id IS DISTINCT FROM OLD.ledger_id OR NEW.credentials IS DISTINCT FROM OLD.credentials
      OR NEW.metadata->'providerId' IS DISTINCT FROM OLD.metadata->'providerId'
      OR NEW.metadata->'version' IS DISTINCT FROM OLD.metadata->'version' THEN
      RAISE EXCEPTION 'E_LEDGER_IDENTITY';
    END IF;
  ELSIF TG_TABLE_NAME = 'opendesk_cc_jobs' THEN
    IF TG_OP = 'DELETE' OR NEW.ledger_id IS DISTINCT FROM OLD.ledger_id OR NEW.key IS DISTINCT FROM OLD.key THEN
      RAISE EXCEPTION 'E_JOB_IMMUTABLE';
    END IF;
  ELSIF TG_TABLE_NAME = 'opendesk_cc_receipts' THEN
    IF TG_OP = 'DELETE' OR NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'E_RECEIPT_IMMUTABLE';
    END IF;
  ELSIF TG_TABLE_NAME = 'opendesk_cc_assignments' THEN
    IF TG_OP = 'DELETE' OR NEW.ledger_id <> OLD.ledger_id OR NEW.key <> OLD.key
      OR (NEW.body - 'leaseUntil') IS DISTINCT FROM (OLD.body - 'leaseUntil') THEN
      RAISE EXCEPTION 'E_ASSIGNMENT_IMMUTABLE';
    END IF;
    IF (NEW.dispatch_slot IS NULL) <> EXISTS
      (SELECT 1 FROM opendesk_cc_receipts WHERE ledger_id = NEW.ledger_id AND key = NEW.key
        AND body #> '{result,retirementState}' = '"released"'::jsonb) THEN
      RAISE EXCEPTION 'E_DISPATCH_SLOT';
    END IF;
  ELSIF TG_TABLE_NAME = 'opendesk_cc_requests' THEN
    IF TG_OP = 'DELETE' OR NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'E_REQUEST_CONFLICT';
    END IF;
  ELSIF TG_TABLE_NAME = 'opendesk_cc_task_pins' THEN
    IF TG_OP = 'DELETE' OR NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'E_TASK_CONFLICT';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Check the final transaction state, so receipt insertion and slot release may
-- occur as separate statements without allowing an inconsistent commit.
CREATE OR REPLACE FUNCTION opendesk_cc_check_dispatch_slot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE slot text; executor text; received boolean;
BEGIN
  SELECT dispatch_slot, body->>'executorId' INTO slot, executor
    FROM opendesk_cc_assignments WHERE ledger_id = NEW.ledger_id AND key = NEW.key;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT EXISTS (SELECT 1 FROM opendesk_cc_receipts
    WHERE ledger_id = NEW.ledger_id AND key = NEW.key
        AND body #> '{result,retirementState}' = '"released"'::jsonb) INTO received;
  IF (received AND slot IS NOT NULL) OR (NOT received AND slot IS DISTINCT FROM executor) THEN
    RAISE EXCEPTION 'E_DISPATCH_SLOT';
  END IF;
  RETURN NULL;
END $$;
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['assignments', 'receipts'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'opendesk_cc_slot_check'
      AND tgrelid = ('opendesk_cc_' || relation)::regclass) THEN
      EXECUTE format('CREATE CONSTRAINT TRIGGER opendesk_cc_slot_check AFTER INSERT OR UPDATE ON %I '
        'DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION opendesk_cc_check_dispatch_slot()',
        'opendesk_cc_' || relation);
    END IF;
  END LOOP;
END $$;
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['jobs', 'receipts', 'assignments', 'requests', 'task_pins'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'opendesk_cc_history'
      AND tgrelid = ('opendesk_cc_' || relation)::regclass) THEN
      EXECUTE format('CREATE TRIGGER opendesk_cc_history BEFORE UPDATE OR DELETE ON %I '
        'FOR EACH ROW EXECUTE FUNCTION opendesk_cc_guard_history()', 'opendesk_cc_' || relation);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'opendesk_cc_identity'
    AND tgrelid = 'opendesk_cc_ledgers'::regclass) THEN
    CREATE TRIGGER opendesk_cc_identity BEFORE UPDATE ON opendesk_cc_ledgers
      FOR EACH ROW EXECUTE FUNCTION opendesk_cc_guard_history();
  END IF;
END $$;
