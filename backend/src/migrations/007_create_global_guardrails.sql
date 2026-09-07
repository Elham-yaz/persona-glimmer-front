-- 007_create_global_guardrails.sql
-- Singleton row (id = 1) holding the context-neutral guidelines injected into every prompt.
CREATE TABLE global_guardrails (
  id INTEGER PRIMARY KEY DEFAULT 1,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (id = 1)
);
