# How to Set Environment Variables in Netlify

## The Issue

You're currently in **Team Settings** → **Environment variables**, which requires a paid plan for shared variables.

You need to set environment variables at the **Site/Project level**, which is free!

---

## Correct Steps

### Step 1: Go to Your Site

1. **From Netlify Dashboard:**
   - Click **"Sites"** or **"Projects"** in the left sidebar (not "Settings")
   - You should see a list of your deployed sites
   - Click on **your site name** (the one connected to your GitHub repo)

### Step 2: Open Site Settings

1. **Once you're on your site page:**
   - Look for **"Site settings"** button (usually in the top right or in a menu)
   - Or click **"Configuration"** in the left sidebar
   - Then click **"Environment variables"**

### Alternative Path:

1. **From your site dashboard:**
   - Click **"Site configuration"** (left sidebar)
   - Click **"Environment variables"**

---

## Step 3: Add Environment Variable

1. **Click "Add variable"** or **"Add environment variable"**

2. **Fill in:**
   - **Key:** `VITE_API_URL`
   - **Value:** `https://persona-glimmer-backend.onrender.com` (your Render backend URL)
   - **Scopes:** Check all boxes:
     - ✅ Production
     - ✅ Preview
     - ✅ Deploy previews

3. **Click "Save"**

---

## Visual Guide

```
Netlify Dashboard
  └─ Sites (click here, not Settings!)
      └─ Your Site Name (click on it)
          └─ Site configuration (left sidebar)
              └─ Environment variables
                  └─ Add variable
```

---

## Quick Navigation

**Wrong Path:**
- Settings → Environment variables (Team level - requires paid plan)

**Correct Path:**
- Sites → Your Site → Site configuration → Environment variables (Site level - FREE!)

---

## After Adding Variable

1. **Redeploy your site:**
   - Go to **"Deploys"** tab
   - Click **"Trigger deploy"** → **"Clear cache and deploy site"**

2. **Verify:**
   - After redeploy, check browser console
   - API calls should now go to your Render URL

---

## Troubleshooting

**Can't find "Sites"?**
- Look for "Projects" or "All sites" in the sidebar
- Or go directly to: `https://app.netlify.com/sites`

**Still can't find it?**
- Try this direct URL pattern:
  - `https://app.netlify.com/sites/YOUR-SITE-NAME/configuration/env`

**Need to find your site name?**
- Check your Netlify dashboard URL
- Or look at your site's domain (e.g., `your-site-name.netlify.app`)

---

## Summary

✅ **Go to:** Sites → Your Site → Site configuration → Environment variables  
❌ **Not:** Settings → Environment variables (that's team-level)
