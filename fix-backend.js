const fs = require('fs');
const f = 'c:/STUDENT APP/alumni-fixed.js';
let c = fs.readFileSync(f, 'utf8');

// Fix graduate route to preserve class_id
// First fix single student graduation
const singleGradPattern = /INSERT INTO alumni_profiles \(user_id, graduation_year, username\)\s+VALUES \(\$1, \$2, \$3\) ON CONFLICT/;
if (singleGradPattern.test(c)) {
  c = c.replace(singleGradPattern, "INSERT INTO alumni_profiles (user_id, graduation_year, username, class_id, school_id)\n      VALUES ($1, $2, $3, (SELECT class_id FROM users WHERE id=$1), (SELECT school_id FROM users WHERE id=$1)) ON CONFLICT");
  console.log('Fixed single graduate');
} else {
  console.log('Single grad pattern not found');
}

// Fix bulk graduation
const bulkGradPattern = /INSERT INTO alumni_profiles \(user_id, graduation_year, username\)\s+VALUES \(\$1,\$2,\$3\) ON CONFLICT/;
if (bulkGradPattern.test(c)) {
  c = c.replace(bulkGradPattern, "INSERT INTO alumni_profiles (user_id, graduation_year, username, class_id, school_id)\n         VALUES ($1,$2,$3,(SELECT class_id FROM users WHERE id=$1),(SELECT school_id FROM users WHERE id=$1)) ON CONFLICT");
  console.log('Fixed bulk graduate');
} else {
  console.log('Bulk grad pattern not found');
}

// Fix profile/me to return class_id
const profilePattern = /SELECT ap\.\*, u\.name, u\.email, u\.role, u\.school_id, s\.name AS school_name,/;
if (profilePattern.test(c)) {
  c = c.replace(profilePattern, "SELECT ap.*, u.name, u.email, u.role, u.school_id, u.class_id, s.name AS school_name,");
  console.log('Fixed profile query');
} else {
  console.log('Profile pattern not found');
}

fs.writeFileSync(f, c);
console.log('Done');
