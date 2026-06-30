const fs = require('fs');
const f = 'c:/STUDENT APP/alumni-fixed.js';
let c = fs.readFileSync(f, 'utf8');

// 1. Fix single graduate: preserve class_id, store in alumni_profiles
const singleGradOld = `UPDATE users SET role='alumni', is_alumni=TRUE, graduation_year=$1, graduated_at=NOW(), alumni_status='active'
       WHERE id=$2 AND role='student' RETURNING id, name, email, graduation_year, graduated_at, school_id`;
const singleGradNew = `UPDATE users SET role='alumni', is_alumni=TRUE, graduation_year=$1, graduated_at=NOW(), alumni_status='active'
       WHERE id=$2 AND role='student' RETURNING id, name, email, graduation_year, graduated_at, school_id, class_id`;
if (c.includes(singleGradOld)) {
  c = c.replace(singleGradOld, singleGradNew);
  console.log('Fixed single graduate RETURNING');
}

// 2. Fix single graduate INSERT to include class_id and school_id
const singleInsertOld = `INSERT INTO alumni_profiles (user_id, graduation_year, username)
       VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET graduation_year=EXCLUDED.graduation_year`;
const singleInsertNew = `INSERT INTO alumni_profiles (user_id, graduation_year, username, class_id, school_id)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO UPDATE SET graduation_year=EXCLUDED.graduation_year, class_id=EXCLUDED.class_id, school_id=EXCLUDED.school_id`;
if (c.includes(singleInsertOld)) {
  c = c.replace(singleInsertOld, singleInsertNew);
  // Also fix the parameters line
  c = c.replace(
    `      [user.id, yr, user.email.split('@')[0] + '-' + user.id]`,
    `      [user.id, yr, user.email.split('@')[0] + '-' + user.id, user.class_id, user.school_id]`
  );
  console.log('Fixed single graduate INSERT');
}

// 3. Fix bulk graduate RETURNING
const bulkGradOld = `UPDATE users SET role='alumni', is_alumni=TRUE, graduation_year=$1, graduated_at=NOW(), alumni_status='active'
       WHERE id=ANY($2::int[]) AND role='student' RETURNING id, name, email, school_id`;
const bulkGradNew = `UPDATE users SET role='alumni', is_alumni=TRUE, graduation_year=$1, graduated_at=NOW(), alumni_status='active'
       WHERE id=ANY($2::int[]) AND role='student' RETURNING id, name, email, school_id, class_id`;
if (c.includes(bulkGradOld)) {
  c = c.replace(bulkGradOld, bulkGradNew);
  console.log('Fixed bulk graduate RETURNING');
}

// 4. Fix bulk graduate INSERT
const bulkInsertOld = `INSERT INTO alumni_profiles (user_id, graduation_year, username)
         VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET graduation_year=EXCLUDED.graduation_year`;
const bulkInsertNew = `INSERT INTO alumni_profiles (user_id, graduation_year, username, class_id, school_id)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id) DO UPDATE SET graduation_year=EXCLUDED.graduation_year, class_id=EXCLUDED.class_id, school_id=EXCLUDED.school_id`;
if (c.includes(bulkInsertOld)) {
  c = c.replace(bulkInsertOld, bulkInsertNew);
  // Fix the parameters
  c = c.replace(
    `        [user.id, yr, user.email.split('@')[0] + '-' + user.id]`,
    `        [user.id, yr, user.email.split('@')[0] + '-' + user.id, user.class_id, user.school_id]`
  );
  console.log('Fixed bulk graduate INSERT');
}

// 5. Fix profile/me to return class_id from alumni_profiles
const profileOld = `SELECT ap.*, u.name, u.email, u.role, u.school_id, s.name AS school_name,
              u.graduation_year, u.graduated_at`;
const profileNew = `SELECT ap.*, u.name, u.email, u.role, u.school_id, COALESCE(ap.class_id, u.class_id) as class_id, s.name AS school_name,
              u.graduation_year, u.graduated_at`;
if (c.includes(profileOld)) {
  c = c.replace(profileOld, profileNew);
  console.log('Fixed profile query');
}

fs.writeFileSync(f, c);
console.log('All backend fixes applied');
