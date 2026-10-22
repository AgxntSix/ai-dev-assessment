-- leadflow CRM schema (v2). The clinic migration (AGX-200) loads into `contacts`.

CREATE TABLE IF NOT EXISTS companies (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  domain      TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER REFERENCES companies(id),
  full_name       TEXT NOT NULL,
  email           TEXT,                       -- lowercased, trimmed
  phone           TEXT,                       -- E.164, e.g. +639171234567
  dob             TEXT,                       -- ISO 8601 date, YYYY-MM-DD
  consent         INTEGER NOT NULL DEFAULT 0 CHECK (consent IN (0, 1)),
  do_not_contact  INTEGER NOT NULL DEFAULT 0 CHECK (do_not_contact IN (0, 1)),
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'inactive', 'deceased')),
  notes           TEXT,
  source          TEXT NOT NULL DEFAULT 'leadflow',
  source_ref      TEXT,                       -- id of the row in the source system
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

CREATE TABLE IF NOT EXISTS deals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id  INTEGER NOT NULL REFERENCES contacts(id),
  company_id  INTEGER REFERENCES companies(id),
  stage       TEXT NOT NULL DEFAULT 'new'
              CHECK (stage IN ('new', 'qualified', 'proposal', 'closed_won', 'closed_lost')),
  owner       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS activities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id  INTEGER NOT NULL REFERENCES contacts(id),
  deal_id     INTEGER REFERENCES deals(id),
  kind        TEXT NOT NULL,
  body        TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Audit log of every write an agent makes.
CREATE TABLE IF NOT EXISTS agent_writes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  trace_id    TEXT NOT NULL,
  agent       TEXT NOT NULL,
  tool        TEXT NOT NULL,
  input_json  TEXT NOT NULL,
  result_json TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
