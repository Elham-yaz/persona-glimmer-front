# Intelligence Levels Update: Numeric to Categorical

## Overview

Changed Emotional Intelligence (EQ) and Cognitive Intelligence (IQ) levels from numeric values (1-10) to categorical values (low, medium, high).

---

## Changes Made

### 1. Database Migration
- **File:** `backend/src/migrations/010_update_agents_intelligence_levels.sql`
- Converts existing INTEGER columns to VARCHAR
- Maps existing values:
  - 1-3 → `low`
  - 4-7 → `medium`
  - 8-10 → `high`

### 2. Backend Updates

#### Models (`backend/src/models/Agent.ts`)
- Changed `emotional_intelligence_level` and `cognitive_intelligence_level` from `number` to `'low' | 'medium' | 'high'`
- Updated `AgentPublic` interface

#### Seed Data (`backend/src/seeds/agents.seed.ts`)
- Updated all 9 agents to use categorical values:
  - Agent 1: low EQ, medium IQ
  - Agent 2: medium EQ, medium IQ
  - Agent 3: medium EQ, low IQ
  - Agent 4: low EQ, high IQ
  - Agent 5: high EQ, low IQ
  - Agent 6: medium EQ, medium IQ
  - Agent 7: medium EQ, medium IQ
  - Agent 8: high EQ, high IQ
  - Agent 9: low EQ, low IQ

#### Agent Service (`backend/src/services/agent.service.ts`)
- Updated system prompt to use categorical values instead of numeric

### 3. Frontend Updates

#### Types (`src/types/index.ts`)
- Added `IntelligenceLevel` type: `'low' | 'medium' | 'high'`
- Updated `Agent` interface

#### API (`src/lib/api.ts`)
- Updated all API response types to use categorical values

#### Components
- **TopicHeader:** Displays "EQ: Low/Medium/High, IQ: Low/Medium/High"
- **Index.tsx:** Updated header display
- **AgentIntroduction:** Updated progress bars and labels (converts to numeric for visual representation)
- **AdminDashboard:** Displays capitalized categorical values

---

## How to Apply Changes

### Step 1: Run Database Migration

```bash
cd backend
npm run migrate
```

This will:
1. Add new VARCHAR columns
2. Convert existing numeric values to categorical
3. Drop old INTEGER columns
4. Add CHECK constraints
5. Set NOT NULL constraints

### Step 2: Re-seed Agents (Optional)

If you want to ensure all agents have the correct categorical values:

```bash
cd backend
npm run seed
```

### Step 3: Deploy

1. **Backend:**
   ```bash
   git add backend/
   git commit -m "Update intelligence levels to categorical (low/medium/high)"
   git push origin main
   ```
   - Render will automatically deploy
   - Make sure migration runs on Render

2. **Frontend:**
   ```bash
   git add src/
   git commit -m "Update frontend to display categorical intelligence levels"
   git push origin main
   ```
   - Netlify will automatically deploy

---

## Display Format

### Before:
- `EQ: 7/10 • IQ: 5/10`
- `EQ: 3, IQ: 7`

### After:
- `EQ: Medium • IQ: Medium`
- `EQ: Low, IQ: High`
- `EQ: High, IQ: Low`

---

## Mapping Reference

| Numeric Range | Categorical |
|--------------|-------------|
| 1-3          | low         |
| 4-7          | medium      |
| 8-10         | high        |

---

## Testing

After deployment, verify:

1. **Admin Dashboard:**
   - Login with admin credentials
   - Check users table shows "EQ: Low/Medium/High, IQ: Low/Medium/High"
   - Check user details modal shows categorical values

2. **Regular User View:**
   - Login as regular user
   - Check header shows categorical values (e.g., "EQ: Medium • IQ: Medium")
   - Check topic header shows categorical values

3. **Database:**
   - Verify agents table has VARCHAR columns
   - Verify values are 'low', 'medium', or 'high'
   - Verify CHECK constraints are in place

---

## Notes

- ✅ Backward compatible: Migration converts existing data
- ✅ Type-safe: TypeScript types updated throughout
- ✅ Consistent: All displays use capitalized format (Low, Medium, High)
- ✅ Database constraints: CHECK constraints ensure data integrity

---

## Files Changed

### Backend:
- `backend/src/migrations/010_update_agents_intelligence_levels.sql` (NEW)
- `backend/src/models/Agent.ts`
- `backend/src/seeds/agents.seed.ts`
- `backend/src/services/agent.service.ts`
- `backend/src/utils/intelligenceLevel.ts` (NEW - helper functions)

### Frontend:
- `src/types/index.ts`
- `src/lib/api.ts`
- `src/components/chat/TopicHeader.tsx`
- `src/components/auth/AgentIntroduction.tsx`
- `src/pages/Index.tsx`
- `src/pages/AdminDashboard.tsx`

---

## Next Steps

1. Run migration on production database
2. Re-seed agents if needed
3. Test all displays
4. Verify admin dashboard shows correct values
5. Deploy to production
