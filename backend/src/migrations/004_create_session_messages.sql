-- 004_create_session_messages.sql
-- Full transcript of every session. sequence is 1-based over all messages
-- (1 = participant opening, 2 = first agent reply, ..., 20 = tenth agent reply).
CREATE TABLE session_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  role VARCHAR(10) NOT NULL CHECK (role IN ('user','agent')),
  content TEXT NOT NULL,
  is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  client_message_id VARCHAR(64),                    -- set on user messages only (idempotency key)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, sequence),
  UNIQUE (session_id, client_message_id)
);
