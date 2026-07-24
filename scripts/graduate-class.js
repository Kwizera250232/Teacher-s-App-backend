const pool = require('../db');

async function graduateClassByCode(classCode, graduationYear) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get class by code
    const classResult = await client.query(
      'SELECT id, name FROM classes WHERE class_code = $1',
      [classCode.toUpperCase()]
    );

    if (classResult.rows.length === 0) {
      console.log(` class with code ${classCode} not found`);
      return;
    }

    const classId = classResult.rows[0].id;
    const className = classResult.rows[0].name;
    console.log(`Found class: ${className} (ID: ${classId})`);

    // Get all students in this class
    const studentsResult = await client.query(
      `SELECT u.id, u.name, u.email, u.school_id
       FROM class_members cm
       JOIN users u ON cm.student_id = u.id
       WHERE cm.class_id = $1 AND u.role='student' AND u.is_alumni=FALSE`,
      [classId]
    );

    const students = studentsResult.rows;
    console.log(`Found ${students.length} students to graduate`);

    if (students.length === 0) {
      console.log('No students to graduate');
      await client.query('ROLLBACK');
      return;
    }

    const studentIds = students.map(s => s.id);
    const yr = graduationYear || new Date().getFullYear();

    // Update users to alumni
    const result = await client.query(
      `UPDATE users SET role='alumni', is_alumni=TRUE, graduation_year=$1, graduated_at=NOW(), alumni_status='active'
       WHERE id=ANY($2::int[]) AND role='student' RETURNING id, name, email, school_id, class_id`,
      [yr, studentIds]
    );

    console.log(`Updated ${result.rows.length} users to alumni`);

    // Create alumni profiles
    for (const user of result.rows) {
      await client.query(
        `INSERT INTO alumni_profiles (user_id, graduation_year, username, class_id, school_id)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id) DO UPDATE SET graduation_year=EXCLUDED.graduation_year, class_id=EXCLUDED.class_id, school_id=EXCLUDED.school_id`,
        [user.id, yr, user.email.split('@')[0] + '-' + user.id, user.class_id, user.school_id]
      );
      await client.query(`INSERT INTO alumni_wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [user.id]);
      // Remove from all class_members
      await client.query('DELETE FROM class_members WHERE student_id=$1', [user.id]);
    }

    await client.query('COMMIT');
    console.log(`Successfully graduated ${result.rows.length} students from class ${className}`);
    console.log(`Graduation year: ${yr}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error graduating class:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  const classCode = process.argv[2] || 'LKGAY5';
  const graduationYear = parseInt(process.argv[3]) || new Date().getFullYear();
  
  graduateClassByCode(classCode, graduationYear)
    .then(() => {
      console.log('Done');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { graduateClassByCode };
