-- 003_create_sessions.sql
-- One anonymous participant session: assignment, progress, and completion code.
-- No IP addresses, user agents, names, or emails are stored.
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_condition_id INTEGER NOT NULL REFERENCES agent_conditions(id),
  context_id INTEGER NOT NULL REFERENCES contexts(id),
  external_id VARCHAR(100),                         -- optional Qualtrics ResponseID passed on the inbound link
  interaction_count INTEGER NOT NULL DEFAULT 0 CHECK (interaction_count BETWEEN 0 AND 10),
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  survey_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completion_code INTEGER UNIQUE CHECK (completion_code BETWEEN 10000 AND 99999),
  model VARCHAR(50) NOT NULL,
  prompt_version VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_created_at ON sessions (created_at);
CREATE INDEX idx_sessions_cell ON sessions (agent_condition_id, context_id);
CREATE INDEX idx_sessions_external_id ON sessions (external_id);
