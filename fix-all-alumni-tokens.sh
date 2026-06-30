#!/bin/bash

FRONTEND=/root/Teacher-s-App-frontent/src/pages/alumni

# Fix 1: Add token to useAuth() where missing
for file in AlumniProfile.jsx AlumniComposition.jsx GraduationManager.jsx AlumniWallet.jsx AlumniDirectory.jsx AlumniCompose.jsx; do
  if [ -f "$FRONTEND/$file" ]; then
    sed -i 's/const { user } = useAuth();/const { user, token } = useAuth();/' "$FRONTEND/$file"
  fi
done

# Fix 2: Add token to api calls in AlumniProfile.jsx
sed -i 's/api.get(\(`[^`]*`\))/api.get(\1, token)/g' "$FRONTEND/AlumniProfile.jsx"
sed -i 's/api.delete(\(`[^`]*`\))/api.delete(\1, token)/g' "$FRONTEND/AlumniProfile.jsx"
sed -i 's/api.post(\(`[^`]*`\))/api.post(\1, token)/g' "$FRONTEND/AlumniProfile.jsx"

# Fix 3: Add token to api calls in AlumniComposition.jsx  
sed -i 's/api.get(\(`[^`]*`\))/api.get(\1, token)/g' "$FRONTEND/AlumniComposition.jsx"
sed -i 's/api.delete(\(`[^`]*`\))/api.delete(\1, token)/g' "$FRONTEND/AlumniComposition.jsx"
sed -i 's/api.post(\(`[^`]*`\))/api.post(\1, token)/g' "$FRONTEND/AlumniComposition.jsx"

# Fix 4: Add token to api calls in AlumniWallet.jsx
sed -i "s/api.get('\/alumni\/wallet')/api.get('\/alumni\/wallet', token)/" "$FRONTEND/AlumniWallet.jsx"

# Fix 5: Add token to api calls in AlumniDirectory.jsx
sed -i 's/api.get(\(`[^`]*`\))/api.get(\1, token)/g' "$FRONTEND/AlumniDirectory.jsx"

# Fix 6: Add token to api calls in AlumniCompose.jsx
sed -i 's/api.get(\(`[^`]*`\))/api.get(\1, token)/g' "$FRONTEND/AlumniCompose.jsx"
sed -i 's/api.put(\(`[^`]*`\))/api.put(\1, token)/g' "$FRONTEND/AlumniCompose.jsx"
sed -i 's/api.post(\(`[^`]*`\))/api.post(\1, token)/g' "$FRONTEND/AlumniCompose.jsx"

# Fix 7: Add token to api calls in GraduationManager.jsx
sed -i "s/api.get('\/auth\/schools')/api.get('\/auth\/schools', token)/" "$FRONTEND/GraduationManager.jsx"
sed -i 's/api.get(\(`[^`]*`\))/api.get(\1, token)/g' "$FRONTEND/GraduationManager.jsx"
sed -i 's/api.post(\(`[^`]*`\))/api.post(\1, token)/g' "$FRONTEND/GraduationManager.jsx"

echo "Done fixing all alumni pages"
