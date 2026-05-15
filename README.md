# DrumTwin

AI-first music intelligence platform.

## Quick start

See [SETUP.md](./SETUP.md) for local setup instructions.

## Stack

- **Runtime**: Node.js 20 (zero framework — one-way-door choices deferred to DRU-3)
- **CI**: GitHub Actions (`.github/workflows/ci.yml`)
- **Deploy**: Railway (`railway.toml`)

## Endpoints

| Method | Path | Response |
|--------|------|----------|
| GET | `/` | `{"status":"ok","service":"drumtwin-api","version":"0.1.0"}` |

## Development

```bash
npm start          # run server on port 3000
npm test           # run test suite
```
