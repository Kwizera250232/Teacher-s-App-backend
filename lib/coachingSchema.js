// lib/coachingSchema.js — ensures coaching session tables exist
const pool = require('../db');

async function ensureCoachingTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coaching_sessions (
        id SERIAL PRIMARY KEY,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        quiz_id INTEGER REFERENCES quizzes(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        topic VARCHAR(255),
        description TEXT,
        scheduled_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
        count_toward_official BOOLEAN NOT NULL DEFAULT FALSE,
        current_question_index INTEGER NOT NULL DEFAULT 0,
        show_answer BOOLEAN NOT NULL DEFAULT FALSE,
        is_paused BOOLEAN NOT NULL DEFAULT FALSE,
        question_group_size INTEGER NOT NULL DEFAULT 5,
        pen_holder_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        whiteboard_data TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS coaching_session_participants (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES coaching_sessions(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ,
        left_at TIMESTAMPTZ,
        is_invited BOOLEAN NOT NULL DEFAULT TRUE,
        UNIQUE (session_id, student_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS coaching_session_answers (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES coaching_sessions(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question_id INTEGER NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
        answer TEXT,
        is_correct BOOLEAN,
        awarded_marks INTEGER NOT NULL DEFAULT 0,
        requires_review BOOLEAN NOT NULL DEFAULT FALSE,
        answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (session_id, student_id, question_id)
      )
    `);

    // Add attempt_source column to quiz_attempts so coaching attempts are distinguishable
    await pool.query(`
      ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS attempt_source VARCHAR(20) NOT NULL DEFAULT 'quiz'
    `);

    // Add is_paused column to coaching_sessions if it doesn't exist (for older deployments)
    await pool.query(`
      ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await pool.query(`
      ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS question_group_size INTEGER NOT NULL DEFAULT 5
    `);
    // Hand-raised students (JSON array of user IDs), speak permission, answer timer
    await pool.query(`
      ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS hand_raised TEXT
    `);
    await pool.query(`
      ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS speak_permission_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    `);
    await pool.query(`
      ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS answer_timer_seconds INTEGER
    `);
    await pool.query(`
      ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS answer_timer_started_at TIMESTAMPTZ
    `);
    await pool.query(`
      ALTER TABLE coaching_sessions ADD COLUMN IF NOT EXISTS show_exercises BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // WebRTC signaling table for audio peer connections
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coaching_webrtc_signals (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES coaching_sessions(id) ON DELETE CASCADE,
        from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        signal_type VARCHAR(20) NOT NULL,
        signal_data TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    console.log('[coaching] tables ready');
  } catch (e) {
    console.error('[coaching] schema error:', e.message);
  }
}

module.exports = { ensureCoachingTables };
