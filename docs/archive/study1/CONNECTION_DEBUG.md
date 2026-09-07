# Connection Debug Guide

## Current Status
- ✅ Backend is running on port 3000
- ✅ Backend health check works
- ❌ Frontend cannot connect to backend

## Debug Steps

### 1. Check Frontend is Running
```bash
# In root directory
npm run dev
```
Should start on `http://localhost:5173`

### 2. Check Browser Console
1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for:
   - "API Base URL: http://localhost:3000"
   - Any CORS errors
   - Network errors

### 3. Check Network Tab
1. Open DevTools (F12)
2. Go to Network tab
3. Try to login
4. Look for the failed request
5. Check:
   - Request URL (should be `http://localhost:3000/api/auth/login`)
   - Status code
   - Error message

### 4. Test Backend Directly
Open in browser: `http://localhost:3000/health`
Should see: `{"status":"ok","timestamp":"..."}`

### 5. Common Issues

#### Issue: Frontend on Different Port
- **Symptom**: CORS error
- **Fix**: Update `FRONTEND_URL` in `backend/.env` to match your frontend port

#### Issue: Backend Not Restarted
- **Symptom**: Old CORS settings
- **Fix**: Restart backend after CORS changes

#### Issue: Firewall/Network
- **Symptom**: Connection refused
- **Fix**: Check Windows Firewall settings

#### Issue: Wrong API URL
- **Symptom**: 404 or connection refused
- **Fix**: Check `VITE_API_URL` in frontend `.env` or verify default `http://localhost:3000`

## Quick Test

Run this in browser console (on frontend page):
```javascript
fetch('http://localhost:3000/health')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);
```

If this works, the issue is in the API service code.
If this fails, it's a network/CORS issue.
