# SSL Configuration Guide

## Quick SSL Setup

### 1. Enable SSL in .env
```bash
# Uncomment and configure these lines in .env:
SSL_ENABLED=true
NGINX_HTTPS_PORT=443
NGINX_CONFIG=nginx.ssl.conf
SSL_CERT_PATH=./ssl/cert.pem
SSL_KEY_PATH=./ssl/key.pem
```

### 2. Get SSL Certificates

#### Option A: Let's Encrypt (Recommended)
```bash
# Install certbot
sudo apt install certbot

# Get certificate
sudo certbot certonly --standalone -d your-domain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./ssl/cert.pem
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./ssl/key.pem
sudo chown $(whoami):$(whoami) ./ssl/*.pem
```

#### Option B: Self-signed (Testing only)
```bash
mkdir -p ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/key.pem \
  -out ssl/cert.pem \
  -subj "/CN=your-domain.com"
```

### 3. Deploy
```bash
docker-compose up -d
```

## Automatic Certificate Renewal
Add to crontab for Let's Encrypt:
```bash
0 12 * * * /usr/bin/certbot renew --quiet && docker-compose restart nginx
```