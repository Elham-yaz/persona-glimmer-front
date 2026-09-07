# Fix: Remove API Key from Git History

## Problem
GitHub is blocking the push because an OpenAI API key was committed in documentation files. Even though we've removed it from the files, it's still in the commit history.

## Solution Options

### Option 1: Use GitHub's Allow URL (Quick Fix)
1. Visit: https://github.com/eldersamolu/persona-glimmer-front/security/secret-scanning/unblock-secret/38lcBSICpWWZ9eBvUfiB3eDP5vW
2. Click "Allow secret" (temporary, for this push only)
3. Then push again

### Option 2: Rewrite Git History (Recommended for Security)
Remove the secret from commit history entirely.

**Steps:**
1. Delete the lock file (if exists):
   ```powershell
   Remove-Item .git\index.lock -Force -ErrorAction SilentlyContinue
   ```

2. Stage the fixed files:
   ```bash
   git add DEPLOYMENT_FIX.md NETLIFY_DEPLOYMENT_GUIDE.md QUICK_DEPLOYMENT_FIX.md RENDER_DEPLOYMENT_CHECKLIST.md RENDER_DEPLOYMENT_GUIDE.md
   ```

3. Amend the last commit:
   ```bash
   git commit --amend --no-edit
   ```

4. Force push (if needed):
   ```bash
   git push origin main --force
   ```

### Option 3: Create New Branch (Safest)
1. Create a new branch without the secret
2. Push the new branch
3. Delete the old branch
4. Rename new branch to main

## Current Status
- ✅ Files have been updated (API key removed)
- ❌ Changes not yet committed
- ❌ Old commit still contains the secret

## Next Steps
Try Option 1 first (quickest), or Option 2 if you want to properly clean the history.
