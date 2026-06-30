#!/bin/bash
cd /root/Teacher-s-App-frontent
npm run build 2>&1 | tail -3
git add -A
git commit -m 'feat: auto-welcome alumni, primary things, teacher graduation button' || true
GIT_SSH_COMMAND='ssh -i ~/.ssh/github_frontent_deploy' git push origin main
