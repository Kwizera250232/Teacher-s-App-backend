const fs = require('fs');
const path = require('path');

async function ensureAlumniSchema(pool) {
  try {
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    // Split on semicolons to get complete statements (handles multi-line CREATE TABLE)
    const statements = sql
      .split(/;(?=\s*(?:--|[A-Z]|\n|$))/)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    // Filter for alumni-related statements only
    const alumniStatements = statements.filter(s => {
      const lower = s.toLowerCase();
      return lower.includes('alumni_') ||
        lower.includes('graduation_') ||
        (lower.includes('create index') && lower.includes('alumni')) ||
        (lower.includes('alter table users') && (lower.includes('is_alumni') || lower.includes('graduation_year') || lower.includes('graduated_at') || lower.includes('alumni_status')));
    });

    for (const stmt of alumniStatements) {
      await pool.query(stmt + ';').catch((e) => {
        console.warn('[alumniSchema] statement skipped:', e.message.slice(0, 100));
      });
    }

    // Ensure ALTER TABLE statements run safely
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_alumni BOOLEAN DEFAULT FALSE`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS graduation_year INTEGER`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS graduated_at TIMESTAMP`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS alumni_status VARCHAR(20) DEFAULT 'active'`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS class_id INTEGER`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_profiles ADD COLUMN IF NOT EXISTS school_id INTEGER`).catch(() => {});

    // Ensure alumni group tables exist (in case schema.sql split missed them)
    await pool.query(`CREATE TABLE IF NOT EXISTS alumni_groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      image_path VARCHAR(500),
      creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_public BOOLEAN DEFAULT TRUE,
      member_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )`).catch(() => {});
    await pool.query(`CREATE TABLE IF NOT EXISTS alumni_group_members (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES alumni_groups(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
      joined_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(group_id, user_id)
    )`).catch(() => {});
    await pool.query(`CREATE TABLE IF NOT EXISTS alumni_group_messages (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES alumni_groups(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT,
      image_path VARCHAR(500),
      message_type VARCHAR(20) NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image','composition','file')),
      reply_to_id INTEGER REFERENCES alumni_group_messages(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_alumni_groups_creator ON alumni_groups(creator_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_members_group ON alumni_group_members(group_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_members_user ON alumni_group_members(user_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_messages_group ON alumni_group_messages(group_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_group_messages_created ON alumni_group_messages(created_at)`).catch(() => {});

    // Ensure users table has avatar_url column
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_library_items ADD COLUMN IF NOT EXISTS uploader_id INTEGER`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_library_items ADD COLUMN IF NOT EXISTS grade_level VARCHAR(20)`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_library_items ADD COLUMN IF NOT EXISTS subject VARCHAR(100)`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_library_items ADD COLUMN IF NOT EXISTS language VARCHAR(50)`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_library_items ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_library_items ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT TRUE`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_groups ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_groups ADD COLUMN IF NOT EXISTS member_count INTEGER DEFAULT 0`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_groups ADD COLUMN IF NOT EXISTS image_path VARCHAR(500)`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_groups ADD COLUMN IF NOT EXISTS creator_id INTEGER`).catch(() => {});
    await pool.query(`ALTER TABLE alumni_groups ADD COLUMN IF NOT EXISTS description TEXT`).catch(() => {});

    // Ensure alumni_recognitions has school_id (self-healing for existing tables)
    await pool.query(`ALTER TABLE alumni_recognitions ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL`).catch(() => {});

    // Ensure composition challenge tables exist
    await pool.query(`CREATE TABLE IF NOT EXISTS composition_challenges (
      id SERIAL PRIMARY KEY,
      topic VARCHAR(500) NOT NULL,
      prompt TEXT NOT NULL,
      category VARCHAR(100) DEFAULT 'general',
      min_words INTEGER DEFAULT 150,
      max_words INTEGER DEFAULT 500,
      guidelines TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`).catch(() => {});
    await pool.query(`CREATE TABLE IF NOT EXISTS composition_submissions (
      id SERIAL PRIMARY KEY,
      challenge_id INTEGER NOT NULL REFERENCES composition_challenges(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255),
      content TEXT NOT NULL,
      word_count INTEGER DEFAULT 0,
      gmail_address VARCHAR(255),
      momo_number VARCHAR(20),
      names VARCHAR(255),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','reviewed','amazing','rewarded','rejected')),
      admin_feedback TEXT,
      reward_amount INTEGER DEFAULT 0,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`).catch(() => {});
    await pool.query(`ALTER TABLE composition_submissions ADD COLUMN IF NOT EXISTS names VARCHAR(255)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_comp_submissions_user ON composition_submissions(user_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_comp_submissions_status ON composition_submissions(status)`).catch(() => {});

    // Seed default challenges if table is empty
    const challengeCount = await pool.query(`SELECT COUNT(*) FROM composition_challenges`).catch(() => ({ rows: [{ count: 0 }] }));
    if (parseInt(challengeCount.rows[0].count) === 0) {
      const defaults = [
        { topic: 'My Journey After Graduation', prompt: 'Write about your life journey after graduating from school. What challenges did you face? What achievements are you proud of? Where are you now?', category: 'personal', guidelines: 'Be authentic and reflective. Share real experiences, not imaginary ones. Structure your essay with an introduction, body paragraphs, and a conclusion.' },
        { topic: 'The Teacher Who Changed My Life', prompt: 'Describe a teacher who had a significant impact on your life. What did they do? How did they shape who you are today?', category: 'reflective', guidelines: 'Use specific examples and anecdotes. Show genuine emotion and gratitude. Minimum 200 words.' },
        { topic: 'If I Could Go Back to School', prompt: 'If you could go back to your school days, what would you do differently? What advice would you give your younger self?', category: 'reflective', guidelines: 'Be honest and introspective. Use concrete examples from your school experience. Think about both academic and personal growth.' },
        { topic: 'Technology and Education in Rwanda', prompt: 'How has technology changed education in Rwanda? What opportunities and challenges does it bring? Share your perspective.', category: 'analytical', guidelines: 'Support your arguments with examples. Consider both positive and negative aspects. Write a well-structured analytical essay.' },
        { topic: 'My Dream for My Community', prompt: 'What is your dream for your community? How do you plan to contribute to its development? What changes would you like to see?', category: 'visionary', guidelines: 'Be ambitious but realistic. Show passion and commitment. Include specific actions you would take.' },
        { topic: 'The Value of Friendship', prompt: 'Write about the importance of friendship in your life. How have your friends from school shaped who you are?', category: 'personal', guidelines: 'Share real stories about your friends. Reflect on what friendship means to you. Be genuine and heartfelt.' },
        { topic: 'Overcoming Adversity', prompt: 'Describe a time when you faced a major challenge. How did you overcome it? What did you learn from the experience?', category: 'personal', guidelines: 'Focus on resilience and growth. Show the emotions you felt. Explain the lessons learned clearly.' },
        { topic: 'The Future of Rwanda', prompt: 'What is your vision for Rwanda in the next 20 years? What role can young people play in shaping this future?', category: 'analytical', guidelines: 'Be forward-thinking. Support your vision with current trends. Show understanding of Rwanda\'s development goals.' },
      ];
      for (const c of defaults) {
        await pool.query(
          `INSERT INTO composition_challenges (topic, prompt, category, guidelines, min_words, max_words, is_active) VALUES ($1,$2,$3,$4,150,500,TRUE)`,
          [c.topic, c.prompt, c.category, c.guidelines]
        ).catch(() => {});
      }
      console.log('[startup] Seeded default composition challenges.');
    }

    console.log('[startup] Alumni schema ready.');
  } catch (err) {
    console.error('[startup] Alumni schema error:', err.message);
  }
}

module.exports = { ensureAlumniSchema };
