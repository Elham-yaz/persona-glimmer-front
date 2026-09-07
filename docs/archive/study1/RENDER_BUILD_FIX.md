# Fix: TypeScript Build Errors on Render

## The Problem

TypeScript compilation fails because `@types/*` packages (in devDependencies) aren't being installed during the build process.

## The Solution

### Option 1: Update Build Command in Render (Recommended)

In your Render service settings, change the **Build Command** to:

```bash
npm install && npm run build
```

This ensures devDependencies are installed before building.

**Note:** The `build` script in `package.json` has been updated to include `npm install`, but you should also update Render's build command to be explicit.

---

### Option 2: Use npm ci (Alternative)

If Option 1 doesn't work, change the Build Command to:

```bash
npm ci && npm run build
```

This uses `npm ci` which installs from `package-lock.json` and respects devDependencies.

---

## Steps to Fix

1. **Go to Render Dashboard:**
   - Open your service: `persona-glimmer-backend`
   - Click **"Settings"** tab

2. **Update Build Command:**
   - Find **"Build Command"** field
   - Change from: `npm install && npm run build`
   - To: `npm install && npm run build` (should already be this, but verify)
   - Or try: `NODE_ENV=development npm install && npm run build`

3. **Alternative - Force DevDependencies:**
   - Build Command: `npm install --include=dev && npm run build`

4. **Save and Redeploy:**
   - Click **"Save Changes"**
   - Go to **"Manual Deploy"** tab
   - Click **"Deploy latest commit"**

---

## Why This Happens

Render may set `NODE_ENV=production` during build, which causes `npm install` to skip devDependencies. The fix ensures devDependencies are installed regardless of NODE_ENV.

---

## After Fix

The build should:
1. ✅ Install all dependencies including @types packages
2. ✅ Compile TypeScript successfully
3. ✅ Start the server

---

## If Still Failing

If the build still fails, you can temporarily move `@types/*` packages to `dependencies` instead of `devDependencies`, but this is not recommended for production.
