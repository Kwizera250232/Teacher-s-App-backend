#!/bin/bash

# IMMEDIATE FIX - Run this on your VPS right now

echo "=== FINDING BACKEND DIRECTORY ==="
find /root -name "package.json" -path "*/Teacher-s-App-backend/*" 2>/dev/null | head -1

echo ""
echo "=== FINDING FRONTEND DIRECTORY ==="
find /root -name "package.json" -path "*/Teacher-s-App-frontent/*" 2>/dev/null | head -1

echo ""
echo "=== CHECKING GIT REPOS IN HOME ==="
ls -la ~/ | grep -i teacher

echo ""
echo "=== CHECKING CURRENT DIRECTORIES ==="
ls -la ~/
