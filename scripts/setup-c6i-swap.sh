#!/bin/bash
# Setup 2GB swap for c6i.large (4GB RAM) to handle peak inference memory spikes.
# Run once after migrating to c6i.large.
set -e

SWAPFILE="/swapfile"

if [ -f "$SWAPFILE" ]; then
  echo "[swap] $SWAPFILE already exists, skipping creation."
else
  echo "[swap] Creating 2G swapfile..."
  sudo fallocate -l 2G "$SWAPFILE"
  sudo chmod 600 "$SWAPFILE"
  sudo mkswap "$SWAPFILE"
  echo "[swap] Swapfile created."
fi

if swapon --show | grep -q "$SWAPFILE"; then
  echo "[swap] Already active."
else
  sudo swapon "$SWAPFILE"
  echo "[swap] Activated."
fi

# Persist across reboots
if ! grep -q "$SWAPFILE" /etc/fstab; then
  echo "$SWAPFILE none swap sw 0 0" | sudo tee -a /etc/fstab
  echo "[swap] Added to /etc/fstab."
fi

# Set swappiness low — only use swap under pressure, not eagerly
sudo sysctl vm.swappiness=10
if ! grep -q "vm.swappiness" /etc/sysctl.conf; then
  echo "vm.swappiness=10" | sudo tee -a /etc/sysctl.conf
fi

echo "[swap] Done. Current swap status:"
free -h | grep -i swap
