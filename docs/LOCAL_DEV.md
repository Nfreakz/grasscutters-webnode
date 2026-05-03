# GrassCutters local development

This setup lets you work locally without pushing every small change to GitHub/Hostinger.

## How it works

- Astro runs on `http://localhost:4321`
- The Node/Express API runs on `http://localhost:3000`
- Astro proxies `/api` and `/gc-data` to the local API, so frontend code can still call relative URLs such as `/api/status`.
- Hostinger remains the production/test deployment. GitHub push is only needed when you want to deploy changes.

## First setup

1. Copy `.env.example` to `.env`.
2. Fill GTX credentials only in `.env`. Never commit `.env`.
3. Run `npm install`.
4. Run `npm run dev`.

## Local URLs

- Web: `http://localhost:4321/`
- API status: `http://localhost:3000/api/status`
- Stracker status: `http://localhost:3000/api/stracker/status`
- Stracker sync: `http://localhost:3000/api/stracker/sync?secret=YOUR_SECRET`
- Hotlaps: `http://localhost:3000/api/hotlaps?limit=25`

## Production preview locally

Run:

```bash
npm run preview
```

This builds Astro into `dist/` and starts the same Express server used by Hostinger.

## Deploy workflow

Only when your local changes work:

```bash
git add .
git commit -m "Describe the change"
git push
```

Then redeploy from Hostinger.
