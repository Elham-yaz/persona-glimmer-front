-- 005_create_session_survey_responses.sql
-- Post-chat survey answers (16 Likert items, 1-7) per session.
CREATE TABLE session_survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id VARCHAR(20) NOT NULL,
  response_value INTEGER NOT NULL CHECK (response_value BETWEEN 1 AND 7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, question_id)
);
