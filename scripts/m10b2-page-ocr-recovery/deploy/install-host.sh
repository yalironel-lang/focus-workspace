# M1.1E E2 — Host install checklist (Ubuntu 22.04/24.04, non-Docker)
#
# Run as root on the VPS AFTER the machine exists and you have SSH access.
# Do not paste service-role keys into chat or shell history when avoidable:
#   sudo install -m 0600 /dev/stdin /etc/zikuk/zikuk-recovery-worker.env
#   (then paste file contents via editor, not echo)
#
# Replace REPO_URL with your git remote. Path must match the systemd unit.

set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl git gnupg \
  tesseract-ocr tesseract-ocr-eng

# Node.js 22 (NodeSource)
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

node -v
tesseract --version | head -1

id zikuk >/dev/null 2>&1 || useradd --system --home /opt/zikuk --shell /usr/sbin/nologin zikuk
install -d -m 0755 -o zikuk -g zikuk /opt/zikuk
install -d -m 0700 -o root -g zikuk /etc/zikuk

REPO_DIR=/opt/zikuk/focus-main-notebook-ff
if [ ! -d "$REPO_DIR/.git" ]; then
  echo "Clone the repo to $REPO_DIR as user zikuk, then re-run npm install steps."
  echo "  sudo -u zikuk git clone <REPO_URL> $REPO_DIR"
  exit 1
fi

cd "$REPO_DIR"
sudo -u zikuk git fetch --all --prune
# Pin/checkout the approved release commit for E2 (update SHA when deploying):
# sudo -u zikuk git checkout 1f1806d

cd "$REPO_DIR"
sudo -u zikuk npm ci --omit=dev

cd "$REPO_DIR/scripts/m10b2-page-ocr-recovery"
sudo -u zikuk npm ci --omit=dev

UNIT_SRC="$REPO_DIR/scripts/m10b2-page-ocr-recovery/deploy/zikuk-recovery-worker.service"
ENV_EXAMPLE="$REPO_DIR/scripts/m10b2-page-ocr-recovery/deploy/zikuk-recovery-worker.env.example"

install -m 0644 "$UNIT_SRC" /etc/systemd/system/zikuk-recovery-worker.service

if [ ! -f /etc/zikuk/zikuk-recovery-worker.env ]; then
  install -m 0600 -o root -g zikuk "$ENV_EXAMPLE" /etc/zikuk/zikuk-recovery-worker.env
  echo "Created /etc/zikuk/zikuk-recovery-worker.env — REPLACE the service-role placeholder with an editor."
  echo "  sudoedit /etc/zikuk/zikuk-recovery-worker.env"
  echo "Do NOT start the worker until the real secret is set and wrong-confirm fail-closed is tested."
fi

systemctl daemon-reload
systemctl enable zikuk-recovery-worker.service

echo "Host prep done. Do NOT start until E2.4–E2.5 gates pass."
echo "  systemctl start zikuk-recovery-worker.service"
echo "  journalctl -u zikuk-recovery-worker -f"
echo "  systemctl stop zikuk-recovery-worker.service"
