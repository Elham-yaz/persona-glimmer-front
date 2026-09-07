-- 001_create_agent_conditions.sql
-- The four agent conditions of the 2x2 (emotional intelligence x cognitive intelligence) design.
CREATE TABLE agent_conditions (
  id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 4),
  code VARCHAR(20) NOT NULL UNIQUE,                 -- hiEI_hiCI | hiEI_loCI | loEI_hiCI | loEI_loCI
  emotional_intelligence VARCHAR(4) NOT NULL CHECK (emotional_intelligence IN ('low','high')),
  cognitive_intelligence VARCHAR(4) NOT NULL CHECK (cognitive_intelligence IN ('low','high')),
  display_name VARCHAR(100) NOT NULL,
  system_prompt_template TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (emotional_intelligence, cognitive_intelligence)
);
