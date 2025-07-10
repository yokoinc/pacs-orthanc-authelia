#!/bin/bash
# =============================================================================
# PAX-ORTHANC QUICK SETUP
# =============================================================================
# Generates secure secrets and creates working .env file
# =============================================================================

set -e

echo "🚀 PAX-ORTHANC Quick Setup"
echo "=========================="
echo

# Check if .env already exists
if [[ -f ".env" ]]; then
    echo "⚠️  .env file already exists!"
    read -p "Overwrite it? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
fi

# Copy example file
echo "📋 Creating .env from template..."
cp .env.example .env

# Generate secrets
echo "🔐 Generating secure secrets..."
SESSION_SECRET=$(openssl rand -base64 48)
STORAGE_KEY=$(openssl rand -base64 48)  
JWT_SECRET=$(openssl rand -base64 48)

# Replace secrets in .env
sed -i "s/AUTHELIA_SESSION_SECRET=.*/AUTHELIA_SESSION_SECRET=$SESSION_SECRET/" .env
sed -i "s/AUTHELIA_STORAGE_ENCRYPTION_KEY=.*/AUTHELIA_STORAGE_ENCRYPTION_KEY=$STORAGE_KEY/" .env
sed -i "s/AUTHELIA_JWT_SECRET=.*/AUTHELIA_JWT_SECRET=$JWT_SECRET/" .env

# Ask for domain
echo
read -p "🌐 Enter your domain (default: pacs.example.com): " domain
domain=${domain:-pacs.example.com}

sed -i "s/pacs.example.com/$domain/g" .env

# Ask for port  
echo
read -p "🔌 Enter external port (default: 30080): " port
port=${port:-30080}

sed -i "s/NGINX_EXTERNAL_PORT=.*/NGINX_EXTERNAL_PORT=$port/" .env

echo
echo "✅ Setup complete!"
echo
echo "📝 Next steps:"
echo "1. Review .env file if needed"
echo "2. For SSL: uncomment SSL variables in .env and configure certificates"
echo "3. Start services: docker-compose up -d"
echo "4. Access your PACS at: http://$domain:$port"
echo