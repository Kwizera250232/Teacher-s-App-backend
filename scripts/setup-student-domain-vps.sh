#!/usr/bin/env bash
# Run ON the VPS as root after DNS: student.umunsi.com A → 93.127.186.217 (remove Vercel CNAME).
set -euo pipefail

APP=/home/umunsi/htdocs/studentapi.umunsi.com
WEB=/home/umunsi/htdocs/student.umunsi.com
NGINX_CONF=/etc/nginx/sites-enabled/student.umunsi.com.conf

cd "$APP"
git fetch origin main
git reset --hard origin/main
rsync -a --delete student-web-dist/ "$WEB/"

cat > "$NGINX_CONF" <<'EOF'
server {
    listen 80;
    server_name student.umunsi.com www.student.umunsi.com;

    location /api/ {
        proxy_pass http://127.0.0.1:3005/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3005/uploads/;
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

nginx -t
systemctl reload nginx

certbot --nginx -d student.umunsi.com -d www.student.umunsi.com --non-interactive --agree-tos -m admin@umunsi.com || true

sudo -u umunsi pm2 restart student-app-api
echo "Done. Test: curl -sI https://student.umunsi.com/ | head -5"
