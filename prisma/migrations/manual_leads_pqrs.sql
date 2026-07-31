-- Oleada 4: campos PQRS en leads
ALTER TABLE cms.leads ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'contact';
ALTER TABLE cms.leads ADD COLUMN IF NOT EXISTS pqrs_type TEXT;
ALTER TABLE cms.leads ADD COLUMN IF NOT EXISTS document TEXT;
ALTER TABLE cms.leads ADD COLUMN IF NOT EXISTS municipality TEXT;
ALTER TABLE cms.leads ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE cms.leads ADD COLUMN IF NOT EXISTS consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cms.leads ADD COLUMN IF NOT EXISTS tracking_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS leads_tracking_code_uidx ON cms.leads (tracking_code);
CREATE INDEX IF NOT EXISTS leads_kind_status_idx ON cms.leads (kind, status);
