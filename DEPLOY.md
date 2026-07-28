# Deploying to games.kjrlabs.in

## The DNS situation first

Right now `games.kjrlabs.in` does **not** reach your VPS. I checked it, and
both of these return Vercel's own 404 page:

```
https://games.kjrlabs.in    ->  404: NOT_FOUND / DEPLOYMENT_NOT_FOUND
https://coolify.kjrlabs.in  ->  404: NOT_FOUND / DEPLOYMENT_NOT_FOUND
```

That response comes from Vercel's edge, which means there is a wildcard
`*.kjrlabs.in` record pointing at Vercel. Until that is overridden,
anything you deploy on the VPS will be unreachable at that hostname.

**Fix:** add an explicit A record that beats the wildcard.

| Type | Name  | Value            | TTL |
|------|-------|------------------|-----|
| A    | games | `<your VPS IP>`  | 60  |

An exact-name record always wins over a wildcard, so no need to touch the
wildcard itself. Verify before deploying:

```bash
dig +short games.kjrlabs.in
# should print your VPS IP, not a vercel-dns hostname
```

If you would rather not touch DNS, host it on Vercel instead — the
wildcard already sends the name there, and the project only needs the
`dist/index.html` file.

---

## Step 1 — get the code onto GitHub

From inside this folder:

```bash
bash setup.sh
```

That creates the repo, commits, and pushes (it uses the `gh` CLI if you
have it, and prints manual instructions if not). It also installs the
hallmark skill.

Make the repo **public** if you want the simplest Coolify path — Coolify
can then pull it with no credentials at all.

---

## Step 2 — create the app in Coolify

1. Open your Coolify dashboard.
2. **New Resource** → **Public Repository** (or *Private Repository* via
   your GitHub App if you kept the repo private).
3. Repository URL: `https://github.com/<your-user>/little-arcade`
   Branch: `main`
4. **Build Pack: `Dockerfile`.**
   Leave the Dockerfile location as `/Dockerfile` — it is in the repo root.
5. **Port: `80`.** This is the one setting people miss; nginx in the
   container listens on 80, not 3000.
6. **Domains:** `https://games.kjrlabs.in`
   Leave "Generate Let's Encrypt certificate" on.
7. **Deploy.**

The build is a plain `nginx:alpine` image with the static files copied in.
It takes well under a minute and there is nothing to install.

### What you get

| Path          | What it is |
|---------------|------------|
| `/`           | the arcade (multi-file source, easiest to debug) |
| `/solo.html`  | the same thing as one self-contained file |

---

## Step 3 — check it

```bash
curl -sI https://games.kjrlabs.in | head -n 1        # expect: HTTP/2 200
curl -s  https://games.kjrlabs.in | grep -o '<title>.*</title>'
```

Then open it on the actual tablet Rithya will use, turn it sideways, and
add it to the home screen — the web manifest makes it launch fullscreen
with no browser chrome.

---

## Redeploying after we add a game

```bash
git add -A && git commit -m "add game 7" && git push
```

Coolify redeploys on push if you enabled the webhook; otherwise hit
**Redeploy** in its UI. `index.html` is served with `no-cache` so the new
version shows up immediately rather than after a cache expiry.

Remember to re-run the bundler if you changed anything, so `/solo.html`
stays in sync:

```bash
node build.js && node build-min.js
```

---

## Troubleshooting

**Coolify build succeeds but the domain 502s.**
The port is wrong. Set it to `80`.

**You get Vercel's 404 instead of the arcade.**
DNS has not propagated, or the A record is missing. Re-check
`dig +short games.kjrlabs.in`.

**Certificate fails to issue.**
Let's Encrypt has to resolve the name to the VPS first. Fix DNS, then
retry the deployment.

**The page loads but is silent.**
Browsers block audio until the first tap. That is why the title screen
says "tap or press any key" — the music starts on that gesture. Check the
Settings screen too, since sound is remembered per device.

**A child's stars vanished.**
Progress lives in `localStorage` under `rithya_arcade_v2`, per browser and
per device. Clearing site data wipes it, and a different browser is a
different set of players. It is not synced anywhere by design — nothing
about the children leaves the device.
