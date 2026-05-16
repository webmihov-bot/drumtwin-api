# Setup Guide

Get from clone to running locally in under 5 minutes.

## Prerequisites

- Node.js 20+ (`node --version`)
- Git

## Local setup

```bash
git clone https://github.com/webmihov-bot/drumtwin-api.git
cd drumtwin-api
npm install
npm start
```

Server is now running at `http://localhost:3000`. Verify:

```bash
curl http://localhost:3000
# {"status":"ok","service":"drumtwin-api","version":"0.1.0"}
```

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP listen port |

Copy `.env.example` (once it exists) to `.env` for local overrides.

## CI

GitHub Actions runs on every push to `main` and on pull requests. The workflow:

1. Installs Node 20
2. Runs `npm ci`
3. Runs `npm test`
4. Smoke-tests the server start

See `.github/workflows/ci.yml`.

## Deployment

**Target**: Railway (https://railway.app)

Railway picks up `railway.toml` automatically. The deploy config:

- Builder: Nixpacks (auto-detects Node.js, no Dockerfile needed)
- Start command: `npm start`
- Health check: `GET /`

### First-time deploy (one-time human step required)

Railway requires a GitHub connection. To link:

1. Push this repo to GitHub (`github.com/webmihov-bot/drumtwin-api`)
2. Create a Railway project at https://railway.app/new
3. Connect the GitHub repo — Railway auto-deploys on every `main` push
4. Copy the generated Railway URL and record it below

**Live URL**: https://api-production-99f76.up.railway.app

Once connected, all subsequent deploys are fully automated via git push.

## Folder structure

```
.
├── .github/
│   └── workflows/
│       └── ci.yml      # GitHub Actions CI
├── src/
│   └── index.js        # Application entry point
├── .gitignore
├── package.json
├── railway.toml        # Railway deploy config
├── README.md
└── SETUP.md            # This file
```
