# Fix: TypeScript Build Errors - Step by Step

## The Problem

Render is not installing `devDependencies` (which include `@types/*` packages needed for TypeScript compilation) during the build process.

## Solution: Update Render Build Command

### Step 1: Update Build Command in Render

1. **Go to Render Dashboard:**
   - Visit: https://dashboard.render.com
   - Open your service: `persona-glimmer-backend`

2. **Go to Settings:**
   - Click **"Settings"** tab (left sidebar)

3. **Update Build Command:**
   - Find **"Build Command"** field
   - **Current:** `npm install && npm run build`
   - **Change to:** `npm install --include=dev && npm run build`
   
   Or alternatively:
   - `NODE_ENV=development npm install && npm run build`

4. **Save:**
   - Click **"Save Changes"** at the bottom

### Step 2: Redeploy

1. Go to **"Manual Deploy"** tab
2. Click **"Deploy latest commit"**
3. Watch the build logs - it should now install devDependencies

---

## Alternative: Use npm ci

If the above doesn't work, try:

**Build Command:**
```bash
npm ci && npm run build
```

This uses `npm ci` which respects devDependencies from `package-lock.json`.

---

## What Changed in Code

I've updated `backend/package.json` to add a `prebuild` script that ensures devDependencies are installed:

```json
"prebuild": "npm install --include=dev"
```

This runs automatically before `npm run build`, but you still need to update Render's build command to ensure it works.

---

## Why This Happens

When `NODE_ENV=production` is set (which Render does by default), `npm install` skips devDependencies. The fix ensures devDependencies are installed regardless.

---

## After Fix

The build should:
1. ✅ Install all dependencies including @types packages
2. ✅ Compile TypeScript without errors
3. ✅ Start the server successfully

---

## Test

After redeploying, check the build logs. You should see:
- `@types/express` being installed
- `@types/node` being installed
- TypeScript compilation succeeding
- Server starting successfully

---

## If Still Failing

If it still fails, try this build command:
```bash
npm install --production=false && npm run build
```

This explicitly tells npm to install devDependencies.
