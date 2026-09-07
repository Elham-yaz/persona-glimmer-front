# How to Redeploy Netlify Site

## After Setting Environment Variable

Once you've added `VITE_API_URL` to your Netlify environment variables, you need to redeploy for the changes to take effect.

---

## Method 1: Trigger Manual Deploy (Recommended)

### Step 1: Go to Deploys Tab

1. **In your Netlify site dashboard:**
   - Make sure you're on your **site page** (not team settings)
   - Click **"Deploys"** tab in the left sidebar
   - Or look for **"Deploys"** at the top of the page

### Step 2: Trigger Deploy

1. **Click the "Trigger deploy" button:**
   - Usually located at the top right of the Deploys page
   - Or click the **"..."** (three dots) menu next to your latest deploy
   - Select **"Trigger deploy"**

2. **Choose deploy type:**
   - Click **"Clear cache and deploy site"** (recommended)
   - This ensures the new environment variable is picked up

3. **Wait for deployment:**
   - Netlify will start a new deployment
   - Watch the build logs to see progress
   - Usually takes 1-3 minutes

---

## Method 2: Push to GitHub (Auto-Deploy)

If you have auto-deploy enabled:

1. **Make a small change to trigger deploy:**
   ```bash
   # Add a comment or whitespace to any file
   git add .
   git commit -m "Trigger Netlify redeploy"
   git push origin main
   ```

2. **Netlify will automatically:**
   - Detect the push
   - Start a new deployment
   - Use the new environment variables

---

## Method 3: Retry Failed Deploy

If you have a failed deploy:

1. **Go to Deploys tab**
2. **Click on the failed deploy**
3. **Click "Retry deploy"** button

---

## Verify Deployment

### Step 1: Check Build Status

1. **In Deploys tab:**
   - Look for your new deploy
   - Status should be **"Published"** (green checkmark)
   - If it says "Building" or "Queued", wait for it to complete

### Step 2: Test Your Site

1. **Visit your Netlify site:**
   - Go to: `https://your-site-name.netlify.app`

2. **Open browser console (F12):**
   - Go to **Network** tab
   - Try signing up or logging in
   - Check the API calls - they should go to your Render URL (not localhost)

3. **Verify API calls:**
   - Look for requests to: `https://persona-glimmer-backend.onrender.com/api/...`
   - Should NOT see requests to: `http://localhost:3000`

---

## Troubleshooting

### Deploy Stuck or Failed?

1. **Check build logs:**
   - Click on the deploy
   - Look for error messages
   - Common issues:
     - Build timeout
     - Missing dependencies
     - Build command errors

2. **Clear cache and retry:**
   - Use "Clear cache and deploy site" option
   - This forces a fresh build

### Environment Variable Not Working?

1. **Verify variable is set:**
   - Go to: Site configuration → Environment variables
   - Make sure `VITE_API_URL` is there
   - Check that scopes are correct (Production, Preview, etc.)

2. **Redeploy again:**
   - Environment variables only apply to NEW deploys
   - Old deploys won't have the new variable

3. **Check variable name:**
   - Must be exactly: `VITE_API_URL` (case-sensitive)
   - Must start with `VITE_` for Vite to pick it up

---

## Quick Steps Summary

1. ✅ Go to your site dashboard
2. ✅ Click **"Deploys"** tab
3. ✅ Click **"Trigger deploy"**
4. ✅ Select **"Clear cache and deploy site"**
5. ✅ Wait for deployment to complete
6. ✅ Test your site

---

## After Redeploy

Once deployment is complete:

- ✅ Your site will use the new `VITE_API_URL`
- ✅ Frontend will connect to Render backend
- ✅ Sign up/login should work!

---

## Need Help?

If deployment fails:
- Check build logs for errors
- Verify environment variable is set correctly
- Make sure Render backend is running
- Check that `VITE_API_URL` value is correct
