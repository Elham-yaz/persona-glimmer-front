# How to Access Database and View Data

## Option 1: Admin API (Recommended)

The easiest way to access all data is through the Admin API endpoints.

### Setup

1. **Get your Admin API Key:**
   - Check your Render environment variables for `ADMIN_API_KEY`
   - Or check `backend/.env` file (local development)

2. **Use the Admin API endpoints:**

### Get Dashboard Statistics
```bash
curl -H "x-admin-api-key: your-admin-key" https://persona-glimmer-backend.onrender.com/api/admin/dashboard
```

### Get All Users
```bash
curl -H "x-admin-api-key: your-admin-key" https://persona-glimmer-backend.onrender.com/api/admin/users
```

### Get All Messages
```bash
curl -H "x-admin-api-key: your-admin-key" https://persona-glimmer-backend.onrender.com/api/admin/messages
```

### Get All Survey Responses
```bash
# AI Literacy Survey
curl -H "x-admin-api-key: your-admin-key" https://persona-glimmer-backend.onrender.com/api/admin/surveys/literacy

# Post-Topic Survey
curl -H "x-admin-api-key: your-admin-key" https://persona-glimmer-backend.onrender.com/api/admin/surveys/post-topic
```

### Get Complete User Data
```bash
curl -H "x-admin-api-key: your-admin-key" https://persona-glimmer-backend.onrender.com/api/admin/users/{userId}
```

---

## Option 2: Direct Database Access (Render)

### Using Render Dashboard

1. **Go to Render Dashboard:**
   - Visit: https://dashboard.render.com
   - Find your PostgreSQL database service

2. **Open Database:**
   - Click on your database
   - Click **"Connect"** tab
   - You'll see connection details

3. **Use PSQL Command:**
   - Copy the PSQL command from Render
   - Run it in your terminal to connect

### Using External Tools

You can use database tools like:
- **pgAdmin**
- **DBeaver**
- **TablePlus**
- **Postico** (Mac)

**Connection Details:**
- **Host:** `dpg-d5erpafpm1nc73fuscug-a.oregon-postgres.render.com`
- **Port:** `5432`
- **Database:** `paid_db_9iwk`
- **Username:** `paid_db_9iwk_user`
- **Password:** `MQyXT14DYC3qe1uqjoKzvYob3pUITGlP`
- **SSL:** Required

---

## Option 3: Render Shell (Command Line)

1. **Go to Render Dashboard**
2. **Open your database service**
3. **Click "Shell" tab**
4. **Run SQL queries:**

```sql
-- View all users
SELECT * FROM users;

-- View all messages
SELECT * FROM messages ORDER BY timestamp DESC;

-- View survey responses
SELECT * FROM ai_literacy_survey_responses;
SELECT * FROM post_topic_survey_responses;

-- View user progress
SELECT 
  u.email,
  u.assigned_agent_id,
  u.current_topic_index,
  COUNT(DISTINCT m.topic_id) as topics_interacted
FROM users u
LEFT JOIN messages m ON u.id = m.user_id
GROUP BY u.id, u.email, u.assigned_agent_id, u.current_topic_index;
```

---

## Quick Reference: Database Tables

### Main Tables:
- `users` - All user accounts
- `agents` - The 9 agents
- `topics` - The 20 topics
- `messages` - All chat messages
- `user_topic_interactions` - Interaction counts and locks
- `ai_literacy_survey_responses` - AI literacy survey data
- `post_topic_survey_responses` - Post-topic survey data
- `global_guardrails` - Global guardrail policy

---

## Admin API Documentation

For detailed API documentation, see:
- `docs/ADMIN_API_DOCUMENTATION.md`
- `ADMIN_API_EXAMPLES.md`

---

## Notes

- **Admin API Key:** Set in Render environment variables as `ADMIN_API_KEY`
- **Database Access:** Requires Render database credentials
- **Security:** Never share your admin API key or database credentials
