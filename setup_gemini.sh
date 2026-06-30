#!/bin/bash
# 1. Add GEMINI_API_KEY to .env
grep -q 'GEMINI_API_KEY=AQ' /root/Teacher-s-App-frontent/Teacher-s-App-backend/.env || \
  echo 'GEMINI_API_KEY=your-gemini-api-key-here' >> /root/Teacher-s-App-frontent/Teacher-s-App-backend/.env

# Also update existing empty one
sed -i 's/^GEMINI_API_KEY=$/GEMINI_API_KEY=your-gemini-api-key-here/' /root/Teacher-s-App-frontent/Teacher-s-App-backend/.env

echo "Key added to .env"
grep GEMINI /root/Teacher-s-App-frontent/Teacher-s-App-backend/.env
