-- 008_create_updated_at_triggers.sql
-- Keep updated_at current on every UPDATE of the mutable tables.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_agent_conditions_updated_at
  BEFORE UPDATE ON agent_conditions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contexts_updated_at
  BEFORE UPDATE ON contexts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_global_guardrails_updated_at
  BEFORE UPDATE ON global_guardrails
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
