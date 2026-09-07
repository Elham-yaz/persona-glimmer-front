# Fix: Root Directory Case Sensitivity Issue

## The Problem

Render is looking for `Backend` (capital B) but your directory is `backend` (lowercase b).

Error message:
```
Root directory "Backend" does not exist
```

## The Solution

### Step 1: Update Root Directory in Render

1. **Go to your Render service dashboard:**
   - Visit: https://dashboard.render.com
   - Click on your service: `persona-glimmer-backend`

2. **Go to Settings:**
   - Click **"Settings"** tab (in the left sidebar)

3. **Find "Root Directory" field:**
   - Scroll down to find the **"Root Directory"** field
   - Currently it says: `Backend` ❌
   - Change it to: `backend` ✅ (lowercase)

4. **Save:**
   - Click **"Save Changes"** at the bottom

5. **Redeploy:**
   - Go to **"Manual Deploy"** tab
   - Click **"Deploy latest commit"**
   - Or wait for auto-deploy if enabled

---

## After Fix

The build should now:
1. ✅ Find the `backend` directory
2. ✅ Install dependencies
3. ✅ Build TypeScript
4. ✅ Start the server

---

## Quick Fix Steps

1. Render Dashboard → Your Service
2. Settings → Root Directory
3. Change `Backend` → `backend`
4. Save Changes
5. Redeploy

That's it! 🎉
