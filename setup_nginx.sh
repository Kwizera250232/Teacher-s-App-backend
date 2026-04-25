#!/bin/bash
set -e

# ──────────────────────────────────────────────
# STUDENT APP – Backend API  (studentapi.umunsi.com → port 3005)
# Frontend is on Vercel – no nginx config needed for it
# ──────────────────────────────────────────────
cat > /etc/nginx/sites-available/studentapi.umunsi.com.conf << 'NGINX'
server {
    listen 80;
    server_name studentapi.umunsi.com;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/studentapi.umunsi.com.conf /etc/nginx/sites-enabled/studentapi.umunsi.com.conf

nginx -t && systemctl reload nginx && echo "NGINX_OK"

# SSL for API subdomain only
certbot --nginx -d studentapi.umunsi.com --non-interactive --agree-tos -m admin@umunsi.com --redirect && echo "SSL_API_OK"

curl -s https://studentapi.umunsi.com/api/health
