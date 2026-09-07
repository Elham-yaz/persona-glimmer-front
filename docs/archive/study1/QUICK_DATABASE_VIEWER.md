# Quick Database Viewer - Simple Commands

## Your Admin API Key
`REPLACE_WITH_ADMIN_API_KEY`

## Your Backend URL
`https://persona-glimmer-backend.onrender.com`

---

## Quick Commands (PowerShell)

### View Dashboard Statistics
```powershell
$headers = @{'x-admin-api-key' = 'REPLACE_WITH_ADMIN_API_KEY'}
$response = Invoke-WebRequest -Uri "https://persona-glimmer-backend.onrender.com/api/admin/dashboard" -Headers $headers -UseBasicParsing
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

### View All Users
```powershell
$headers = @{'x-admin-api-key' = 'REPLACE_WITH_ADMIN_API_KEY'}
$response = Invoke-WebRequest -Uri "https://persona-glimmer-backend.onrender.com/api/admin/users" -Headers $headers -UseBasicParsing
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

### View All Messages
```powershell
$headers = @{'x-admin-api-key' = 'REPLACE_WITH_ADMIN_API_KEY'}
$response = Invoke-WebRequest -Uri "https://persona-glimmer-backend.onrender.com/api/admin/messages" -Headers $headers -UseBasicParsing
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

### View Survey Responses
```powershell
# AI Literacy Survey
$headers = @{'x-admin-api-key' = 'REPLACE_WITH_ADMIN_API_KEY'}
$response = Invoke-WebRequest -Uri "https://persona-glimmer-backend.onrender.com/api/admin/surveys/literacy" -Headers $headers -UseBasicParsing
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10

# Post-Topic Survey
$headers = @{'x-admin-api-key' = 'REPLACE_WITH_ADMIN_API_KEY'}
$response = Invoke-WebRequest -Uri "https://persona-glimmer-backend.onrender.com/api/admin/surveys/post-topic" -Headers $headers -UseBasicParsing
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

### View Specific User Data
```powershell
# Replace {userId} with actual user ID
$headers = @{'x-admin-api-key' = 'REPLACE_WITH_ADMIN_API_KEY'}
$response = Invoke-WebRequest -Uri "https://persona-glimmer-backend.onrender.com/api/admin/users/{userId}" -Headers $headers -UseBasicParsing
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

---

## Using the Script (Easier)

I've created a PowerShell script for you: `view-database-data.ps1`

### Usage:
```powershell
# View dashboard
.\view-database-data.ps1 dashboard

# View all users
.\view-database-data.ps1 users

# View all messages
.\view-database-data.ps1 messages

# View all surveys
.\view-database-data.ps1 surveys

# View specific user
.\view-database-data.ps1 user <userId>
```

---

## What You Can See

Based on your test, you currently have:
- ✅ **14 users** registered
- ✅ **20 messages** total
- ✅ **5 users** completed literacy survey
- ✅ **8 interactions** total
- ✅ **0 post-topic surveys** completed

---

## Save Data to File

To save the data to a file for analysis:

```powershell
$headers = @{'x-admin-api-key' = 'REPLACE_WITH_ADMIN_API_KEY'}
$response = Invoke-WebRequest -Uri "https://persona-glimmer-backend.onrender.com/api/admin/users" -Headers $headers -UseBasicParsing
$response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10 | Out-File -FilePath "users-data.json" -Encoding UTF8
```

---

## Your Current Stats

From your test:
```json
{
  "totalUsers": 14,
  "totalMessages": 20,
  "completedLiteracySurvey": 5,
  "totalInteractions": 8,
  "completedPostTopicSurveys": 0,
  "agentDistribution": [...]
}
```

---

## Next Steps

1. **View users:** Run the "View All Users" command above
2. **View messages:** Run the "View All Messages" command
3. **View surveys:** Run the survey commands
4. **Export data:** Save to JSON files for analysis

Your database is connected and accessible! ✅
