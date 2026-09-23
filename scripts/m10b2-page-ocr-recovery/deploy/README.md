# M1.1E E2 — VPS + systemd deployment (non-Docker)

**Status:** deployment-support files only. Production start requires an authorized host.

## Architecture

ONE Linux VPS → Node 22 → Tesseract → repo checkout → `runRecoveryWorker.ts` → systemd.

## Files

| Path | Purpose |
|------|---------|
| `zikuk-recovery-worker.service` | systemd unit (no secrets) |
| `zikuk-recovery-worker.env.example` | EnvironmentFile template |
| `install-host.sh` | Ubuntu package + layout helper |

## Operator sequence (after VPS exists)

1. SSH as admin; run `install-host.sh` (or follow its steps).
2. Clone repo to `/opt/zikuk/focus-main-notebook-ff` as user `zikuk`.
3. `sudoedit /etc/zikuk/zikuk-recovery-worker.env` — set real `SUPABASE_SERVICE_ROLE_KEY` (never commit).
4. Fail-closed test: wrong `ZIKUK_RECOVERY_PRODUCTION_CONFIRM` → `systemctl start` → expect exit / `config_rejected` in journal → fix confirm.
5. Recapture Production baseline (read-only).
6. `systemctl start zikuk-recovery-worker` → expect `config_ok` → `idle_sleep`.
7. `systemctl stop` (kill switch) → start again → idle.
8. Only then: isolated synthetic OCR proof (authorized separately in E2.7).

## Commands

```bash
systemctl status zikuk-recovery-worker
journalctl -u zikuk-recovery-worker -f --no-pager
systemctl stop zikuk-recovery-worker
systemctl start zikuk-recovery-worker
systemctl disable --now zikuk-recovery-worker   # kill switch + no restart
```

## Secrets

- File: `/etc/zikuk/zikuk-recovery-worker.env`
- Mode: `0600`
- Owner: `root:zikuk` (or `root:root`)
- Never in git, Docker image, Vercel, or chat

See also `../PRODUCTION_RUNBOOK.md`.
