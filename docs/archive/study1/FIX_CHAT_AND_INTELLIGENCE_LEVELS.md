# Fix Chat and Intelligence Levels

## Issues Fixed

1. **Database Migration Error**: Database still had INTEGER columns but code was trying to insert VARCHAR values
2. **Agent Not Responding**: Enhanced prompts and error handling
3. **Intelligence Level Prompts**: Updated to use categorical values (low/medium/high) with detailed guidance
4. **Policy Integration**: Policies are now properly included in system prompts

---

## Changes Made

### 1. Database Migration (`backend/src/migrations/010_update_agents_intelligence_levels.sql`)
- Made migration idempotent (safe to run multiple times)
- Handles case where columns are already VARCHAR
- Properly converts numeric values to categorical
- Added to migration list in `run-migrations.ts`

### 2. Agent Service (`backend/src/services/agent.service.ts`)
- **Enhanced System Prompts**: Now includes detailed guidance based on intelligence levels
- **Emotional Intelligence Guidance**:
  - Low: Direct, factual, less warm
  - Medium: Balanced, professional, friendly
  - High: Warm, empathetic, emotionally attuned
- **Cognitive Intelligence Guidance**:
  - Low: Simple, straightforward, basic scripts
  - Medium: Clear, well-reasoned, logical
  - High: Complex problem-solving, analytical, detailed
- **Policy Integration**: 
  - Global guardrails included
  - Topic-specific policies included
  - Topic stimulus included as context
- **Response Requirements**: 
  - Must respond to every message
  - Must address user's question directly
  - Never say "I don't know" - always provide helpful response

### 3. OpenAI Service (`backend/src/services/openai.service.ts`)
- Added fallback response if OpenAI returns empty
- Enhanced error handling
- Added presence_penalty and frequency_penalty for better responses

---

## How to Apply

### Step 1: Run Migration

```bash
cd backend
npm run migrate
```

This will:
- Convert INTEGER columns to VARCHAR
- Convert existing numeric values (1-10) to categorical (low/medium/high)
- Add CHECK constraints
- Safe to run multiple times (idempotent)

### Step 2: Re-seed Agents

```bash
npm run seed
```

This will update all agents with categorical intelligence levels.

### Step 3: Test Chat

1. Start backend:
   ```bash
   cd backend
   npm run dev
   ```

2. Test chat functionality:
   - Login as user
   - Send a message
   - Verify agent responds appropriately
   - Check that response matches agent's intelligence profile

---

## System Prompt Structure

The system prompt now includes:

1. **Agent Template**: Base personality description
2. **Intelligence Profile**: 
   - Detailed EQ guidance (low/medium/high)
   - Detailed CQ guidance (low/medium/high)
3. **Global Guidelines**: Guardrails from database
4. **Topic-Specific Policy**: Policy for current topic
5. **Conversation Guidelines**: 
   - Stay on topic
   - Use topic stimulus as context
   - Follow policies strictly
   - Redirect out-of-scope queries
6. **Response Requirements**:
   - Must respond to every message
   - Directly address questions
   - Be conversational and natural
   - Never refuse to help

---

## Intelligence Level Behavior

### Low EQ + Low CQ
- Simple, direct responses
- Basic scripts
- Less emotional nuance
- Straightforward problem-solving

### Medium EQ + Medium CQ
- Balanced approach
- Professional but friendly
- Clear reasoning
- Some empathy

### High EQ + High CQ
- Warm and empathetic
- Complex problem-solving
- Emotionally intelligent
- Detailed, analytical responses

### Mixed Profiles
- Low EQ + High CQ: Technical, precise, less warm
- High EQ + Low CQ: Empathetic, simple solutions, emotionally supportive

---

## Testing Checklist

- [ ] Migration runs successfully
- [ ] Agents seeded with categorical values
- [ ] Chat sends messages
- [ ] Agent responds to messages
- [ ] Responses match intelligence profile
- [ ] Policies are followed
- [ ] Topic stimulus is used as context
- [ ] Out-of-scope queries are redirected
- [ ] No errors in console

---

## Troubleshooting

### Migration Fails
- Check if columns already exist
- Migration is idempotent - safe to retry
- Check database connection

### Agent Not Responding
- Check OpenAI API key is set
- Check OpenAI API is accessible
- Check error logs in console
- Verify system prompt is being built correctly

### Wrong Intelligence Behavior
- Verify agents are seeded correctly
- Check system prompt includes intelligence guidance
- Verify migration converted values correctly

---

## Next Steps

1. Run migration: `npm run migrate`
2. Re-seed agents: `npm run seed`
3. Test chat functionality
4. Verify responses match intelligence profiles
5. Deploy to production
