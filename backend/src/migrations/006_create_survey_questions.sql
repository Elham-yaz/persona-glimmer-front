-- 006_create_survey_questions.sql
-- Frozen item text for the post-chat survey, so exports can be joined without the frontend source.
CREATE TABLE survey_questions (
  question_id VARCHAR(20) PRIMARY KEY,
  text TEXT NOT NULL,
  category VARCHAR(50),
  position INTEGER NOT NULL UNIQUE,
  version VARCHAR(10) NOT NULL
);
