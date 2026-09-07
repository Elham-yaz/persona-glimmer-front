-- 002_create_contexts.sql
-- The three service contexts; one is assigned per session.
CREATE TABLE contexts (
  id INTEGER PRIMARY KEY CHECK (id BETWEEN 1 AND 3),
  code VARCHAR(40) NOT NULL UNIQUE,                 -- food_utilitarian | food_hedonic | hotel_informational
  title VARCHAR(200) NOT NULL,
  domain VARCHAR(100) NOT NULL,
  scenario_type VARCHAR(20) NOT NULL CHECK (scenario_type IN ('utilitarian','hedonic','informational')),
  participant_scenario TEXT NOT NULL,               -- shown to participant AND auto-sent as their first message (D4)
  agent_policy TEXT NOT NULL,                       -- hidden reference material for the agent
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
