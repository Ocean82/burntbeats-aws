#!/bin/bash
# Deploy burntbeats-aws to EC2 using Docker Compose
# Run from Git Bash or WSL on Windows:  bash deploy-to-ec2.sh

set -e

SERVER="ubuntu@52.0.207.242"
SSH_KEY="$HOME/.ssh/server_saver_key"
REMOTE_DIR="/home/ubuntu/burntbeats-aws"

echo "🚀 Deploying burntbeats to EC2..."

# 1. Create a tarball of the project (excluding heavy/unnecessary dirs)
echo "📦 Creating deployment archive..."
tar czf /tmp/burntbeats-deploy.tar.gz \
  --exclude='./node_modules' \
  --exclude='./.venv' \
  --exclude='./.git' \
  --exclude='./.pytest_cache' \
  --exclude='./.ruff_cache' \
  --exclude='./frontend/dist' \
  --exclude='./tmp' \
  --exclude='./models' \
  --exclude='./benchmark_out' \
  --exclude='./*.tgz' \
  .

echo "✅ Archive created"

# 2. Upload to server
echo "📤 Uploading to server..."
scp -i "$SSH_KEY" /tmp/burntbeats-deploy.tar.gz "$SERVER:/tmp/burntbeats-deploy.tar.gz"
echo "✅ Upload complete"

# 3. Extract and deploy on server
echo "🐳 Deploying on server..."
ssh -i "$SSH_KEY" "$SERVER" << ENDSSH
set -e

# Extract archive
echo "Extracting..."
mkdir -p $REMOTE_DIR
tar xzf /tmp/burntbeats-deploy.tar.gz -C $REMOTE_DIR
rm /tmp/burntbeats-deploy.tar.gz
echo "✅ Extracted to $REMOTE_DIR"

# Stop old PM2 ghost processes
pm2 stop burntbeats 2>/dev/null || true
pm2 delete burntbeats 2>/dev/null || true

# Build and start with Docker Compose
cd $REMOTE_DIR
echo "Building and starting containers..."
sudo docker compose up -d --build

echo ""
echo "📊 Container status:"
sudo docker compose ps

echo ""
echo "📝 Recent logs:"
sudo docker compose logs --tail=30
ENDSSH

echo ""
echo "✅ Deployment complete!"
echo "🌐 https://burntbeats.com"
echo ""
echo "Useful commands (run from Git Bash):"
echo "  Logs:    ssh -i \$HOME/.ssh/server_saver_key $SERVER 'cd $REMOTE_DIR && sudo docker compose logs -f'"
echo "  Status:  ssh -i \$HOME/.ssh/server_saver_key $SERVER 'cd $REMOTE_DIR && sudo docker compose ps'"
echo "  Restart: ssh -i \$HOME/.ssh/server_saver_key $SERVER 'cd $REMOTE_DIR && sudo docker compose restart'"
echo "  Rebuild: ssh -i \$HOME/.ssh/server_saver_key $SERVER 'cd $REMOTE_DIR && sudo docker compose up -d --build'"
