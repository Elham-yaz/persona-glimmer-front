# Fixes: Password Recovery & Topic Stimulus

## Issues Fixed

### 1. Password Recovery Not Showing ✅

**Problem:**
- "Forgot password" link wasn't working
- Clicking it didn't show the password recovery form

**Fix:**
- Changed `onForgotPassword={() => setShowForgotPassword(false)}` 
- To: `onForgotPassword={() => setShowForgotPassword(true)}`

**File Changed:**
- `src/pages/Index.tsx` - Fixed forgot password handler

**How to Test:**
1. Go to login page
2. Click "Forgot your password?"
3. Should now show the password recovery form ✅

---

### 2. Topic Stimulus as First Message ✅

**Problem:**
- Topic stimulus text wasn't being sent automatically
- Users had to manually type the stimulus to start conversation
- Conversations could go in wrong direction without initial context

**Fix:**
- Modified `loadCurrentTopicAndMessages()` function
- Now automatically sends stimulus text as the first message when:
  - User loads a topic for the first time (no messages exist)
  - Stimulus text exists and is not empty

**How It Works:**
1. When user loads a topic, check if messages exist
2. If no messages AND stimulus exists:
   - Automatically send stimulus as first user message
   - Agent responds to the stimulus
   - Conversation starts with proper context

**File Changed:**
- `src/pages/Index.tsx` - Updated `loadCurrentTopicAndMessages()` function

**How to Test:**
1. Complete literacy survey
2. Start a new topic
3. Should automatically see:
   - Stimulus text as first user message
   - Agent response to the stimulus
   - Conversation continues from there

---

## Database Access

### How to View Database Data

**Option 1: Admin API (Easiest)**

Use the Admin API endpoints with your admin API key:

```bash
# Get all users
curl -H "x-admin-api-key: your-key" https://persona-glimmer-backend.onrender.com/api/admin/users

# Get all messages
curl -H "x-admin-api-key: your-key" https://persona-glimmer-backend.onrender.com/api/admin/messages

# Get dashboard stats
curl -H "x-admin-api-key: your-key" https://persona-glimmer-backend.onrender.com/api/admin/dashboard
```

**Option 2: Direct Database Access**

1. Go to Render Dashboard
2. Open your PostgreSQL database
3. Use the connection details to connect with a database tool
4. Or use Render Shell to run SQL queries

**See:** `DATABASE_ACCESS_GUIDE.md` for detailed instructions

---

## Next Steps

1. **Commit and push changes:**
   ```bash
   git add src/pages/Index.tsx
   git commit -m "Fix password recovery link and auto-send topic stimulus as first message"
   git push origin main
   ```

2. **Test:**
   - Test password recovery (should show form now)
   - Test new topic (should auto-send stimulus)

---

## Summary

✅ **Password Recovery:** Fixed - "Forgot password" link now works  
✅ **Topic Stimulus:** Fixed - Automatically sent as first message  
✅ **Database Access:** Guide created - See `DATABASE_ACCESS_GUIDE.md`
