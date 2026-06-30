#!/bin/bash
cd /root/Teacher-s-App-frontent/Teacher-s-App-backend
# Remove any broken dean-ai lines
sed -i '/dean-ai/d' index.js
# Add a single correct mount after the alumni route line
node -e '
const fs = require("fs");
let t = fs.readFileSync("index.js", "utf8");
const line = "app.use(\x27/api/dean-ai\x27, require(\x27./routes/dean-ai\x27));";
if (!t.includes("/api/dean-ai")) {
  // insert after the alumni route
  t = t.replace(/(app\.use\(\x27\/api\/alumni\x27,[^\n]*\);)/, "$1\n" + line);
}
fs.writeFileSync("index.js", t);
console.log("Mounted dean-ai:");
'
grep -n 'dean-ai' index.js
echo "=== restarting ==="
pm2 restart studentapi-main --update-env 2>&1 | tail -2
echo "=== test ==="
sleep 2
curl -s -o /dev/null -w "chat endpoint: %{http_code}\n" -X POST https://studentapi.umunsi.com/api/dean-ai/chat
curl -s -o /dev/null -w "search endpoint: %{http_code}\n" https://studentapi.umunsi.com/api/dean-ai/search-quizzes
