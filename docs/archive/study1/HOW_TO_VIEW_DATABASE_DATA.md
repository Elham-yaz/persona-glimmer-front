# How to View Database Data - Quick Guide

## Your Admin API Key

You've set: `REPLACE_WITH_ADMIN_API_KEY` in Render

---

## Quick Access Methods

### Method 1: Using Browser (Easiest)

1. **Install a browser extension:**
   - **ModHeader** (Chrome/Edge) - Add custom headers
   - Or use **Postman** (desktop app)

2. **Add the header:**
   - Header name: `x-admin-api-key`
   - Header value: `REPLACE_WITH_ADMIN_API_KEY`

3. **Visit these URLs:**

**Dashboard Stats:**
```
https://persona-glimmer-backend.onrender.com/api/admin/dashboard
```

**All Users:**
```
https://persona-glimmer-backend.onrender.com/api/admin/users
```

**All Messages:**
```
https://persona-glimmer-backend.onrender.com/api/admin/messages
```

**All Survey Responses:**
```
https://persona-glimmer-backend.onrender.com/api/admin/surveys/literacy
https://persona-glimmer-backend.onrender.com/api/admin/surveys/post-topic
```

---

### Method 2: Using PowerShell (Windows)

**Get Dashboard Stats:**
```powershell
$headers = @{'x-admin-api-key' = 'REPLACE_WITH_ADMIN_API_KEY'}
$response = Invoke-WebRequest -Uri "https://persona-glimmer-backend.onrender.com/api/admin/dashboard" -Headers $headers
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

**Get All Users:**
```powershell
$headers = @{'x-admin-api-key' = 'REPLACE_WITH_ADMIN_API_KEY'}
$response = Invoke-WebRequest -Uri "https://persona-glimmer-backend.onrender.com/api/admin/users" -Headers $headers
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

**Get All Messages:**
```powershell
$headers = @{'x-admin-api-key' = 'REPLACE_WITH_ADMIN_API_KEY'}
$response = Invoke-WebRequest -Uri "https://persona-glimmer-backend.onrender.com/api/admin/messages" -Headers $headers
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

---

### Method 3: Using cURL (Command Line)

**Get Dashboard Stats:**
```bash
curl -H "x-admin-api-key: REPLACE_WITH_ADMIN_API_KEY" https://persona-glimmer-backend.onrender.com/api/admin/dashboard
```

**Get All Users:**
```bash
curl -H "x-admin-api-key: REPLACE_WITH_ADMIN_API_KEY" https://persona-glimmer-backend.onrender.com/api/admin/users
```

**Get All Messages:**
```bash
curl -H "x-admin-api-key: REPLACE_WITH_ADMIN_API_KEY" https://persona-glimmer-backend.onrender.com/api/admin/messages
```

---

## What Data You Can See

### 1. Dashboard Statistics
- Total users
- Total messages
- Survey completion rates
- Agent distribution
- Interaction counts

### 2. All Users
- User emails
- Assigned agents
- Current topic progress
- Completion status

### 3. All Messages
- All chat messages
- User and agent messages
- Timestamps
- Topic associations

### 4. Survey Responses
- AI Literacy Survey responses
- Post-Topic Survey responses
- Linked to users and topics

### 5. Individual User Data
- Complete data for a specific user
- All their messages
- All their survey responses
- Progress tracking

---

## Direct Database Access (Alternative)

If you want to see the raw database:

1. **Go to Render Dashboard:**
   - https://dashboard.render.com
   - Find your PostgreSQL database

2. **Click "Connect" tab**
   - You'll see connection details
   - Use a database tool (DBeaver, pgAdmin, etc.)

3. **Connection Info:**
   - Host: `dpg-d5erpafpm1nc73fuscug-a.oregon-postgres.render.com`
   - Port: `5432`
   - Database: `paid_db_9iwk`
   - Username: `paid_db_9iwk_user`
   - Password: `MQyXT14DYC3qe1uqjoKzvYob3pUITGlP`
   - SSL: Required

---

## Quick Test

Test if your Admin API key works:

```powershell
$headers = @{'x-admin-api-key' = 'REPLACE_WITH_ADMIN_API_KEY'}
Invoke-WebRequest -Uri "https://persona-glimmer-backend.onrender.com/api/admin/dashboard" -Headers $headers
```

If you get JSON data back, it's working! ✅

---

## Important Notes

- ✅ **Database is already connected** - Your backend uses the Render database
- ✅ **Admin API Key:** `REPLACE_WITH_ADMIN_API_KEY` (set in Render)
- ⚠️ **Security:** Don't share your admin API key publicly
- ✅ **All data is accessible** via Admin API endpoints

---

## Need More Help?

- See `docs/ADMIN_API_DOCUMENTATION.md` for all endpoints
- See `ADMIN_API_EXAMPLES.md` for more examples
- See `DATABASE_ACCESS_GUIDE.md` for detailed instructions
