#!/bin/bash
cd /root/Teacher-s-App-frontent/Teacher-s-App-backend
export $(grep GEMINI .env | xargs)
echo "Key starts with: ${GEMINI_API_KEY:0:10}..."
echo "=== Testing Gemini API ==="
RESP=$(curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Say hello in one word"}]}],"generationConfig":{"maxOutputTokens":50}}')
echo "$RESP" | head -c 500
echo ""
echo "=== Test via Node (like dean-ai.js does) ==="
node -e '
const apiKey = process.env.GEMINI_API_KEY;
console.log("Key present:", !!apiKey, "length:", apiKey?.length);
async function test() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Say hello in one word" }] }],
      generationConfig: { maxOutputTokens: 50 },
    }),
  });
  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Response:", JSON.stringify(data).slice(0, 300));
}
test().catch(e => console.error("Error:", e.message));
'
