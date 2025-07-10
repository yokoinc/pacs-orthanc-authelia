#!/bin/bash
# =============================================================================
# SSL SETUP SCRIPT FOR PAX-ORTHANC
# =============================================================================
# This script helps set up SSL certificates for self-hosted deployment
# Choose between Let's Encrypt or manual certificate installation
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SSL_DIR="./ssl"
DOMAIN=""
EMAIL=""

echo -e "${BLUE}==================================================================${NC}"
echo -e "${BLUE}             PAX-ORTHANC SSL CERTIFICATE SETUP${NC}"
echo -e "${BLUE}==================================================================${NC}"
echo

# Check if running as root (needed for port 80/443)
if [[ $EUID -eq 0 ]]; then
   echo -e "${YELLOW}Warning: Running as root. Consider using a non-root user with sudo.${NC}"
   echo
fi

# Create SSL directory
mkdir -p "$SSL_DIR"

echo "Choose SSL certificate method:"
echo "1) Let's Encrypt (automatic, free, recommended)"
echo "2) Manual certificate installation"
echo "3) Self-signed certificate (testing only)"
echo
read -p "Enter choice (1-3): " choice

case $choice in
    1)
        echo -e "${GREEN}Setting up Let's Encrypt...${NC}"
        
        # Get domain and email
        read -p "Enter your domain name (e.g., pacs.example.com): " DOMAIN
        read -p "Enter your email address: " EMAIL
        
        if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
            echo -e "${RED}Error: Domain and email are required for Let's Encrypt${NC}"
            exit 1
        fi
        
        # Install certbot if not present
        if ! command -v certbot &> /dev/null; then
            echo "Installing certbot..."
            if command -v apt-get &> /dev/null; then
                sudo apt-get update
                sudo apt-get install -y certbot
            elif command -v yum &> /dev/null; then
                sudo yum install -y certbot
            else
                echo -e "${RED}Error: Please install certbot manually${NC}"
                exit 1
            fi
        fi
        
        # Stop nginx if running
        echo "Stopping nginx container..."
        docker-compose stop nginx 2>/dev/null || true
        
        # Get certificate
        echo "Obtaining SSL certificate..."
        sudo certbot certonly --standalone \
            --email "$EMAIL" \
            --agree-tos \
            --no-eff-email \
            --domains "$DOMAIN"
        
        # Copy certificates
        sudo cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$SSL_DIR/cert.pem"
        sudo cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$SSL_DIR/key.pem"
        sudo chown $(whoami):$(whoami) "$SSL_DIR"/*.pem
        
        # Update .env file
        if [[ -f ".env" ]]; then
            sed -i "s/^# SSL_ENABLED=.*/SSL_ENABLED=true/" .env
            sed -i "s/^# SSL_CERT_PATH=.*/SSL_CERT_PATH=.\/ssl\/cert.pem/" .env
            sed -i "s/^# SSL_KEY_PATH=.*/SSL_KEY_PATH=.\/ssl\/key.pem/" .env
        fi
        
        echo -e "${GREEN}Let's Encrypt certificate installed successfully!${NC}"
        echo -e "${YELLOW}Remember to renew certificates before expiry (90 days)${NC}"
        ;;
        
    2)
        echo -e "${GREEN}Manual certificate installation...${NC}"
        echo
        echo "Please place your SSL certificate files in the following locations:"
        echo "  - Certificate: $SSL_DIR/cert.pem"
        echo "  - Private key: $SSL_DIR/key.pem"
        echo "  - Certificate chain (optional): $SSL_DIR/chain.pem"
        echo
        read -p "Press Enter when files are in place..."
        
        # Verify files exist
        if [[ ! -f "$SSL_DIR/cert.pem" || ! -f "$SSL_DIR/key.pem" ]]; then
            echo -e "${RED}Error: Certificate files not found${NC}"
            exit 1
        fi
        
        # Test certificate
        openssl x509 -in "$SSL_DIR/cert.pem" -text -noout > /dev/null
        if [[ $? -eq 0 ]]; then
            echo -e "${GREEN}Certificate file is valid${NC}"
        else
            echo -e "${RED}Error: Invalid certificate file${NC}"
            exit 1
        fi
        
        # Update .env file
        if [[ -f ".env" ]]; then
            sed -i "s/^# SSL_ENABLED=.*/SSL_ENABLED=true/" .env
            sed -i "s/^# SSL_CERT_PATH=.*/SSL_CERT_PATH=.\/ssl\/cert.pem/" .env
            sed -i "s/^# SSL_KEY_PATH=.*/SSL_KEY_PATH=.\/ssl\/key.pem/" .env
        fi
        
        echo -e "${GREEN}Manual certificate installed successfully!${NC}"
        ;;
        
    3)
        echo -e "${YELLOW}Creating self-signed certificate (TESTING ONLY)...${NC}"
        
        read -p "Enter domain/hostname (default: localhost): " DOMAIN
        DOMAIN=${DOMAIN:-localhost}
        
        # Generate self-signed certificate
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "$SSL_DIR/key.pem" \
            -out "$SSL_DIR/cert.pem" \
            -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN"
        
        # Update .env file
        if [[ -f ".env" ]]; then
            sed -i "s/^# SSL_ENABLED=.*/SSL_ENABLED=true/" .env
            sed -i "s/^# SSL_CERT_PATH=.*/SSL_CERT_PATH=.\/ssl\/cert.pem/" .env
            sed -i "s/^# SSL_KEY_PATH=.*/SSL_KEY_PATH=.\/ssl\/key.pem/" .env
        fi
        
        echo -e "${GREEN}Self-signed certificate created successfully!${NC}"
        echo -e "${RED}WARNING: Self-signed certificates are not trusted by browsers${NC}"
        echo -e "${RED}Use only for testing purposes${NC}"
        ;;
        
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo
echo -e "${GREEN}SSL setup complete!${NC}"
echo
echo "Next steps:"
echo "1. Update your .env file with the correct domain name"
echo "2. Start the stack with SSL:"
echo "   ${BLUE}docker-compose -f docker-compose.yml -f docker-compose.ssl.yml up -d${NC}"
echo
echo "3. For Let's Encrypt, set up automatic renewal:"
echo "   ${BLUE}echo '0 12 * * * /usr/bin/certbot renew --quiet' | sudo crontab -${NC}"
echo
echo -e "${YELLOW}Note: Make sure your domain DNS points to this server's public IP${NC}"