# google-workspace-bridge

A small Google Workspace bridge for Gmail, Calendar, and Drive with durable OAuth handling.

## Why this exists

`gog` has been convenient but unreliable enough in practice that this repo exists to provide a more transparent, controllable integration path for Jony and future automations.

## Current scope

- Gmail search / read
- Calendar list / create / update
- Drive search / export
- local OAuth token persistence in `.local/token.json`

## Setup

1. Create a Google OAuth app and enable Gmail, Calendar, and Drive APIs.
2. Copy `.env.example` to `.env` and fill in your OAuth values.
3. Install dependencies:

```bash
npm install
```

4. Authenticate:

```bash
npm run auth
```

## Examples

```bash
npm run gmail:search -- "in:inbox newer_than:7d"
npm run gmail:get -- <messageId>
npm run calendar:list -- "2026-05-01T00:00:00-07:00" "2026-05-05T23:59:00-07:00"
npm run drive:search -- "resume"
```

## Notes

- Token state is stored locally in `.local/token.json`
- This is intentionally simple and intended to grow into a more capable local bridge
- Next likely step: expose these operations as a local API / MCP-compatible bridge for assistants
