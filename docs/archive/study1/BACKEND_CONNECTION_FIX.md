# Backend Connection Error Fix

## Problem
Users were getting "Authentication failed" errors when the backend service was actually just waking up (Render free tier cold starts). The error message was misleading and didn't distinguish between connection issues and actual authentication failures.

## Solutions Implemented

### 1. Health Check Before Authentication
- Added `checkBackendHealth()` function that pings `/health` endpoint
- Added `waitForBackend()` function that waits up to 30 seconds for backend to wake up
- Auth endpoints now check backend health before attempting authentication

### 2. Improved Retry Logic
- Increased retries from 3 to 5 for cold starts
- Increased initial delay from 1s to 2s
- Added retry for 502, 503, 504 errors (service unavailable)
- Added retry for timeout errors (AbortError)
- Added retry for CORS errors (may indicate backend is down)
- Added 30-second timeout for fetch requests

### 3. Better Error Messages
- Connection errors now show: "Service temporarily unavailable" instead of "Authentication failed"
- Specific messages for:
  - Backend waking up: "Backend service may be starting up. Please wait a moment and try again."
  - Timeout: "Request timed out. The backend service may be taking longer than usual to respond."
  - Service unavailable: "Backend service is temporarily unavailable. It may be starting up."

### 4. Graceful Error Handling
- Distinguishes between:
  - **Connection errors** (backend unavailable) → "Service temporarily unavailable"
  - **Authentication errors** (wrong credentials) → "Authentication failed"
  - **Rate limiting** → "Too many attempts"
  - **Validation errors** → Specific validation messages

## Files Changed

1. **`src/lib/api.ts`**
   - Added `checkBackendHealth()` function
   - Added `waitForBackend()` function
   - Improved `apiRequest()` with health checks and better retry logic
   - Better error messages for connection issues
   - Increased timeout to 30 seconds

2. **`src/utils/retry.ts`**
   - Enhanced retry logic to handle 502, 503, 504 errors
   - Added timeout error handling
   - Added CORS error handling

3. **`src/pages/Index.tsx`**
   - Updated error handling to distinguish connection vs auth errors
   - Better error messages in UI

## How It Works

1. **Before Auth Request:**
   - Checks `/health` endpoint (5 second timeout)
   - If not available, waits up to 25 seconds (checking every 2 seconds)
   - Only proceeds with auth if backend is available

2. **During Request:**
   - 30-second timeout per request
   - Retries up to 5 times with exponential backoff
   - Retries on: network errors, timeouts, 502/503/504 errors

3. **Error Display:**
   - Connection issues → "Service temporarily unavailable"
   - Auth failures → "Authentication failed" (only for actual credential errors)

## Testing

After deployment, test:
1. **Cold Start:** Wait for backend to sleep, then try to login
   - Should show "Service temporarily unavailable" and wait for backend
   - Should eventually succeed once backend wakes up

2. **Wrong Credentials:** Try login with wrong password
   - Should show "Authentication failed" (not connection error)

3. **Backend Down:** If backend is actually down
   - Should show clear message about service being unavailable
   - Should not confuse with authentication errors

## Environment Variables

Make sure `VITE_API_URL` is set correctly in Netlify:
- Production: `https://persona-glimmer-backend.onrender.com`
- Development: `http://localhost:3000` (fallback)

## Notes

- Health check adds ~5-30 seconds delay on first request (while backend wakes up)
- This is expected behavior for Render free tier
- Users will see "Service temporarily unavailable" message during wake-up
- Once backend is awake, subsequent requests are fast
