# Recipe Pocket Cloudflare Pages Setup

This guide explains how to put Recipe Pocket online so Android users can open it in Chrome and choose **Add to Home screen**.

The setup has two parts:

1. Put the app files on GitHub.
2. Connect that GitHub repository to Cloudflare Pages.

After that, new versions are easy: change the app, commit, push, and Cloudflare publishes it.

## What You Are Publishing

Recipe Pocket is a static web app. That means it does not need a server, database, or build step.

These files must be published together:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `service-worker.js`
- `icon.svg`
- `DEPLOYMENT.md`

Important: `index.html` and `service-worker.js` should be in the same folder.

## Recommended Route

Use a separate GitHub repository just for this Android app. This is the simplest Cloudflare setup.

Suggested repository name:

```text
recipe-pocket-android
```

In that repository, the files should look like this:

```text
recipe-pocket-android/
  index.html
  styles.css
  app.js
  manifest.webmanifest
  service-worker.js
  icon.svg
  DEPLOYMENT.md
```

## Step 1: Create the GitHub Repository

1. Go to GitHub.
2. Click **New repository**.
3. Repository name: `recipe-pocket-android`.
4. Choose **Public** or **Private**.
5. Create the repository.

Private is fine. Cloudflare can still deploy it after you give Cloudflare access.

## Step 2: Put the App Files in GitHub

Copy the files from this folder:

```text
C:\Users\sande\Documents\Codex\2026-06-24\i\outputs\RecipeManagerAndroid
```

into the new GitHub repository.

Then commit and push them to GitHub.

Your first commit message can be:

```text
Initial Android recipe app
```

## Step 3: Create the Cloudflare Pages Project

1. Go to the Cloudflare dashboard.
2. Open **Workers & Pages**.
3. Click **Create application**.
4. Choose **Pages**.
5. Choose **Connect to Git**.
6. Connect your GitHub account if Cloudflare asks.
7. Select the `recipe-pocket-android` repository.
8. Click **Begin setup**.

## Step 4: Cloudflare Build Settings

Use these settings exactly if the app files are at the repository root:

```text
Project name: recipe-pocket
Production branch: main
Framework preset: None
Build command: leave empty
Build output directory: /
Root directory: /
```

What these mean:

- **Framework preset: None** because this app is plain HTML, CSS, and JavaScript.
- **Build command: empty** because there is nothing to compile.
- **Build output directory: /** because the files to publish are already in the root folder.
- **Root directory: /** because Cloudflare should look at the whole repository.

Then click **Save and Deploy**.

## Step 5: Find Your App Link

After the deploy finishes, Cloudflare gives you a link like:

```text
https://recipe-pocket.pages.dev
```

Open that link on your computer first. You should see Recipe Pocket.

Then open the same link on an Android phone in Chrome.

## Step 6: Install on Android

On the Android phone:

1. Open the Cloudflare Pages link in Chrome.
2. Tap the Chrome menu.
3. Tap **Add to Home screen** or **Install app**.
4. Accept the install.
5. Open Recipe Pocket from the new home screen icon.

Test these before sharing with users:

- Add a recipe.
- Close the app.
- Open it again.
- Check that the recipe is still there.
- Go to Settings.
- Export a backup.

## Releasing a New Version

Every public release should change three things.

In `app.js`:

```js
const APP_VERSION = "1.0.1";
const APP_VERSION_NOTES = "Short note about what changed";
```

In `service-worker.js`:

```js
const CACHE_NAME = "recipe-pocket-v1.0.1";
```

Then:

1. Commit the changes.
2. Push to GitHub.
3. Cloudflare Pages automatically starts a new deployment.
4. Wait for the deployment to finish.
5. Open the app and check Settings.
6. Existing users should see the update banner after their phone notices the new version.

Users' recipes are stored on their own phone/browser. Normal app updates should not erase recipes.

## If You Keep It Inside a Bigger Repository

You can put this app inside a larger repository, but the Cloudflare settings change slightly.

Example repository layout:

```text
my-apps/
  windows-recipe-manager/
  android-recipe-pocket/
    index.html
    styles.css
    app.js
    manifest.webmanifest
    service-worker.js
    icon.svg
```

For that setup, use:

```text
Framework preset: None
Build command: leave empty
Root directory: android-recipe-pocket
Build output directory: /
```

For this current workspace folder, the app is here:

```text
outputs/RecipeManagerAndroid
```

So if you publish from a larger repo that contains this workspace, the Cloudflare root directory would be:

```text
outputs/RecipeManagerAndroid
```

## Custom Domain Later

The free `pages.dev` address is enough to start.

Later, you can add your own domain in the Cloudflare Pages project:

```text
Pages project > Custom domains > Set up a custom domain
```

Example:

```text
recipes.yourdomain.com
```

## Backup Advice for Users

Before a major update, ask users to open Recipe Pocket and go to:

```text
Settings > Export backup
```

That gives them a JSON backup file they can import again if needed.

## Simple Release Checklist

Before sharing a new version:

- Version number changed in `app.js`
- Version notes changed in `app.js`
- Cache name changed in `service-worker.js`
- Changes committed and pushed
- Cloudflare deployment succeeded
- App opens on Android Chrome
- Add/edit recipe still works
- Export backup still works
