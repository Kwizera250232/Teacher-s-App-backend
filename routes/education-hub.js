const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// ── Upload setup for institution images ──────────────────────────────────────
const eduhubUploadDir = path.join(__dirname, '../uploads/eduhub');
if (!fs.existsSync(eduhubUploadDir)) fs.mkdirSync(eduhubUploadDir, { recursive: true });

const eduhubStorage = multer.diskStorage({
  destination: eduhubUploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const prefix = file.fieldname === 'banner' ? 'banner' : 'logo';
    cb(null, `${prefix}_${Date.now()}_${Math.round(Math.random() * 1e4)}${ext}`);
  },
});
const eduhubUpload = multer({
  storage: eduhubStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const exts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (exts.includes(ext)) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  },
});

// ── Schema migration ─────────────────────────────────────────────────────────
pool.query(`
  CREATE TABLE IF NOT EXISTS eduhub_institutions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('university','tvet','secondary')),
    description TEXT,
    banner_url TEXT,
    logo_url TEXT,
    website VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(100),
    province VARCHAR(100),
    district VARCHAR(100),
    sector VARCHAR(100),
    address TEXT,
    is_public BOOLEAN DEFAULT TRUE,
    is_boarding BOOLEAN DEFAULT FALSE,
    is_day BOOLEAN DEFAULT TRUE,
    curriculum VARCHAR(100),
    rating NUMERIC(3,2) DEFAULT 0,
    verified BOOLEAN DEFAULT FALSE,
    claimed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_featured BOOLEAN DEFAULT FALSE,
    stats JSONB DEFAULT '{}',
    facilities JSONB DEFAULT '[]',
    social_links JSONB DEFAULT '{}',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_eduhub_inst_type ON eduhub_institutions(type);
  CREATE INDEX IF NOT EXISTS idx_eduhub_inst_province ON eduhub_institutions(province);
  CREATE INDEX IF NOT EXISTS idx_eduhub_inst_featured ON eduhub_institutions(is_featured);

  CREATE TABLE IF NOT EXISTS eduhub_programs (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES eduhub_institutions(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    faculty VARCHAR(200),
    duration VARCHAR(100),
    degree VARCHAR(100),
    entry_requirements TEXT,
    fees VARCHAR(100),
    intake VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_eduhub_prog_inst ON eduhub_programs(institution_id);

  CREATE TABLE IF NOT EXISTS eduhub_scholarships (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER REFERENCES eduhub_institutions(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    amount VARCHAR(100),
    eligibility TEXT,
    deadline DATE,
    link VARCHAR(255),
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_eduhub_schol_inst ON eduhub_scholarships(institution_id);

  CREATE TABLE IF NOT EXISTS eduhub_events (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES eduhub_institutions(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_date DATE,
    location VARCHAR(255),
    image_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS eduhub_news (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES eduhub_institutions(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS eduhub_gallery (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES eduhub_institutions(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    caption VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS eduhub_claims (
    id SERIAL PRIMARY KEY,
    institution_id INTEGER NOT NULL REFERENCES eduhub_institutions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position VARCHAR(100),
    representative_name VARCHAR(200),
    official_email VARCHAR(255),
    official_phone VARCHAR(100),
    website VARCHAR(255),
    national_id_url TEXT,
    authorization_letter_url TEXT,
    staff_card_url TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','info_requested')),
    admin_note TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS eduhub_saves (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id INTEGER NOT NULL REFERENCES eduhub_institutions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, institution_id)
  );

  CREATE TABLE IF NOT EXISTS eduhub_follows (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id INTEGER NOT NULL REFERENCES eduhub_institutions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, institution_id)
  );

  CREATE TABLE IF NOT EXISTS eduhub_careers (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    skills_required TEXT,
    subjects_to_focus TEXT,
    future_demand VARCHAR(100),
    estimated_salary VARCHAR(100),
    video_url TEXT,
    category VARCHAR(100),
    trait_weights JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS eduhub_career_questions (
    id SERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    trait_scores JSONB NOT NULL,
    order_num INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS eduhub_career_assessments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    answers JSONB NOT NULL,
    results JSONB,
    completed_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_eduhub_ca_user ON eduhub_career_assessments(user_id);

  CREATE TABLE IF NOT EXISTS eduhub_jobs (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    company VARCHAR(200),
    location VARCHAR(200),
    description TEXT,
    requirements TEXT,
    salary VARCHAR(100),
    link VARCHAR(255),
    deadline DATE,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS eduhub_internships (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    company VARCHAR(200),
    location VARCHAR(200),
    description TEXT,
    requirements TEXT,
    duration VARCHAR(100),
    link VARCHAR(255),
    deadline DATE,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS eduhub_mentorship (
    id SERIAL PRIMARY KEY,
    mentor_name VARCHAR(200) NOT NULL,
    mentor_title VARCHAR(200),
    expertise VARCHAR(200),
    bio TEXT,
    photo_url TEXT,
    email VARCHAR(255),
    linkedin VARCHAR(255),
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
  );

  ALTER TABLE eduhub_careers ADD COLUMN IF NOT EXISTS trait_weights JSONB DEFAULT '{}';
`).then(() => {
  console.log('[education-hub] schema ready');
  // ── Seed default career questions if none exist ────────────────────────────
  pool.query('SELECT COUNT(*) as cnt FROM eduhub_career_questions').then(r => {
    if (parseInt(r.rows[0].cnt) === 0) {
      const defaults = [
        { question: 'What subjects do you enjoy the most?', options: ['Mathematics & Sciences', 'Languages & Literature', 'Business & Economics', 'Arts & Design'], traits: [{ analytical: 3, creative: 1 }, { social: 3, creative: 2 }, { analytical: 2, practical: 3 }, { creative: 3, artistic: 3 }] },
        { question: 'Do you enjoy solving complex problems?', options: ['Yes, I love challenges', 'Sometimes', 'Rarely', 'I prefer simple tasks'], traits: [{ analytical: 3 }, { analytical: 1, practical: 1 }, { social: 1 }, { practical: 2 }] },
        { question: 'Do you enjoy helping people?', options: ['Yes, very much', 'Sometimes', 'Not really', 'I prefer working with things'], traits: [{ social: 3 }, { social: 1 }, { analytical: 2 }, { practical: 2 }] },
        { question: 'Would you rather work indoors or outdoors?', options: ['Indoors (office/lab)', 'Mix of both', 'Outdoors', 'Does not matter'], traits: [{ analytical: 2, practical: 1 }, { practical: 2, social: 1 }, { practical: 3 }, { analytical: 1, social: 1 }] },
        { question: 'Do you enjoy working with computers and technology?', options: ['Yes, absolutely', 'Somewhat', 'Not really', 'I prefer people over machines'], traits: [{ analytical: 3, technical: 3 }, { analytical: 1, technical: 1 }, { social: 2 }, { social: 3 }] },
        { question: 'Do you like drawing, designing, or creating art?', options: ['Yes, it is my passion', 'Sometimes', 'Not really', 'I prefer logical tasks'], traits: [{ creative: 3, artistic: 3 }, { creative: 1 }, { analytical: 2 }, { analytical: 3 }] },
        { question: 'Would you enjoy leading a team?', options: ['Yes, I am a natural leader', 'If needed', 'I prefer to follow', 'I prefer working alone'], traits: [{ social: 3, leadership: 3 }, { social: 1, leadership: 1 }, { practical: 2 }, { analytical: 2 }] },
        { question: 'Would you rather repair machines or build software?', options: ['Repair machines', 'Build software', 'Both', 'Neither'], traits: [{ practical: 3, technical: 2 }, { analytical: 3, technical: 3 }, { technical: 3 }, { social: 2 }] },
        { question: 'Do you like teaching others?', options: ['Yes, I love sharing knowledge', 'Sometimes', 'Not really', 'I prefer learning myself'], traits: [{ social: 3, leadership: 2 }, { social: 1 }, { analytical: 2 }, { analytical: 2 }] },
        { question: 'Are you interested in healthcare or medicine?', options: ['Yes, very much', 'Somewhat', 'Not really', 'I prefer other fields'], traits: [{ social: 3, analytical: 2 }, { social: 1, analytical: 1 }, { practical: 2 }, { creative: 2 }] },
        { question: 'Do you enjoy writing or speaking in public?', options: ['Yes, both', 'Writing more', 'Speaking more', 'Neither'], traits: [{ social: 2, creative: 2 }, { creative: 3 }, { social: 3, leadership: 2 }, { analytical: 2 }] },
        { question: 'Are you interested in business and entrepreneurship?', options: ['Yes, I want to start a business', 'Maybe in the future', 'Not really', 'I prefer stable employment'], traits: [{ leadership: 3, practical: 2 }, { practical: 1, leadership: 1 }, { analytical: 2 }, { practical: 2, social: 1 }] },
        { question: 'Do you enjoy working with numbers and data?', options: ['Yes, I love math and statistics', 'Somewhat', 'Not really', 'I prefer words and ideas'], traits: [{ analytical: 3 }, { analytical: 1 }, { creative: 2, social: 1 }, { creative: 2 }] },
        { question: 'Would you like to work in agriculture or environment?', options: ['Yes', 'Maybe', 'Not really', 'I prefer urban environments'], traits: [{ practical: 3 }, { practical: 1 }, { analytical: 2 }, { social: 1, analytical: 1 }] },
        { question: 'Do you enjoy building or constructing things?', options: ['Yes, I love hands-on work', 'Sometimes', 'Not really', 'I prefer intellectual work'], traits: [{ practical: 3, technical: 2 }, { practical: 1 }, { social: 2 }, { analytical: 3 }] },
      ];
      defaults.forEach((q, i) => {
        const traitMap = {};
        q.traits.forEach((t, idx) => { traitMap[String(idx)] = t; });
        pool.query(
          'INSERT INTO eduhub_career_questions (question, options, trait_scores, order_num) VALUES ($1,$2,$3,$4)',
          [q.question, JSON.stringify(q.options), JSON.stringify(traitMap), i + 1]
        ).catch(e => console.error('[education-hub] seed question:', e.message));
      });
      console.log('[education-hub] Seeded', defaults.length, 'default career questions');
    }
  }).catch(e => console.error('[education-hub] seed check:', e.message));

  // ── Seed default careers if none exist ─────────────────────────────────────
  pool.query('TRUNCATE eduhub_careers RESTART IDENTITY').then(() => {
  pool.query('SELECT COUNT(*) as cnt FROM eduhub_careers').then(r => {
    if (parseInt(r.rows[0].cnt) === 0) {
      const careers = [
        { title: 'Software Engineer', category: 'Technology', description: 'Design and build software applications and systems.', skills_required: 'Programming, problem-solving, analytical thinking', subjects_to_focus: 'Mathematics, Computer Science, Physics', future_demand: 'Very High', estimated_salary: '500,000 - 2,000,000 RWF/month', trait_weights: { analytical: 3, technical: 3 } },
        { title: 'Doctor / Medical Officer', category: 'Healthcare', description: 'Diagnose and treat patients in hospitals and clinics.', skills_required: 'Biology, chemistry, empathy, critical thinking', subjects_to_focus: 'Biology, Chemistry, Mathematics, Physics', future_demand: 'Very High', estimated_salary: '800,000 - 3,000,000 RWF/month', trait_weights: { social: 3, analytical: 2 } },
        { title: 'Civil Engineer', category: 'Engineering', description: 'Design and supervise construction of infrastructure projects.', skills_required: 'Mathematics, physics, project management', subjects_to_focus: 'Mathematics, Physics, Geography', future_demand: 'High', estimated_salary: '600,000 - 2,500,000 RWF/month', trait_weights: { practical: 3, analytical: 2, technical: 1 } },
        { title: 'Teacher / Educator', category: 'Education', description: 'Teach and mentor students at various levels.', skills_required: 'Communication, patience, subject expertise', subjects_to_focus: 'All subjects depending on specialization', future_demand: 'High', estimated_salary: '300,000 - 800,000 RWF/month', trait_weights: { social: 3, leadership: 2 } },
        { title: 'Entrepreneur / Business Owner', category: 'Business', description: 'Start and run your own business venture.', skills_required: 'Leadership, risk-taking, financial literacy', subjects_to_focus: 'Economics, Business Studies, Mathematics', future_demand: 'High', estimated_salary: 'Variable', trait_weights: { leadership: 3, practical: 2 } },
        { title: 'Graphic Designer', category: 'Creative', description: 'Create visual content for brands and organizations.', skills_required: 'Creativity, design software, visual thinking', subjects_to_focus: 'Art, Computer Science, Languages', future_demand: 'Medium', estimated_salary: '300,000 - 1,000,000 RWF/month', trait_weights: { creative: 3, artistic: 3 } },
        { title: 'Nurse', category: 'Healthcare', description: 'Provide patient care in hospitals and community settings.', skills_required: 'Empathy, biology, stamina, communication', subjects_to_focus: 'Biology, Chemistry, Mathematics', future_demand: 'Very High', estimated_salary: '400,000 - 1,200,000 RWF/month', trait_weights: { social: 3, practical: 2 } },
        { title: 'Accountant', category: 'Finance', description: 'Manage financial records and ensure tax compliance.', skills_required: 'Mathematics, attention to detail, analytical thinking', subjects_to_focus: 'Mathematics, Economics, Business Studies', future_demand: 'High', estimated_salary: '400,000 - 1,500,000 RWF/month', trait_weights: { analytical: 3, practical: 1 } },
        { title: 'Agricultural Scientist', category: 'Agriculture', description: 'Research and develop improved farming techniques.', skills_required: 'Biology, chemistry, field research', subjects_to_focus: 'Biology, Chemistry, Geography', future_demand: 'High', estimated_salary: '400,000 - 1,200,000 RWF/month', trait_weights: { practical: 3, analytical: 2 } },
        { title: 'Journalist / Writer', category: 'Media', description: 'Report news and create written content for publications.', skills_required: 'Writing, research, communication, curiosity', subjects_to_focus: 'Languages, History, Computer Science', future_demand: 'Medium', estimated_salary: '300,000 - 900,000 RWF/month', trait_weights: { creative: 3, social: 2 } },
        { title: 'Electrician', category: 'Trades', description: 'Install and repair electrical systems in buildings.', skills_required: 'Technical skills, safety awareness, problem-solving', subjects_to_focus: 'Physics, Mathematics, Technical Studies', future_demand: 'High', estimated_salary: '300,000 - 800,000 RWF/month', trait_weights: { practical: 3, technical: 2 } },
        { title: 'Lawyer', category: 'Law', description: 'Provide legal advice and represent clients in court.', skills_required: 'Critical thinking, communication, research', subjects_to_focus: 'History, Languages, Economics', future_demand: 'Medium', estimated_salary: '500,000 - 3,000,000 RWF/month', trait_weights: { analytical: 2, social: 2, leadership: 1 } },
      ];
      careers.forEach(c => {
        pool.query(
          'INSERT INTO eduhub_careers (title, category, description, skills_required, subjects_to_focus, future_demand, estimated_salary, trait_weights) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [c.title, c.category, c.description, c.skills_required, c.subjects_to_focus, c.future_demand, c.estimated_salary, JSON.stringify(c.trait_weights)]
        ).catch(e => console.error('[education-hub] seed career:', e.message));
      });
      console.log('[education-hub] Seeded', careers.length, 'default careers');
    }
  }).catch(e => console.error('[education-hub] career seed check:', e.message));
  }).catch(e => console.error('[education-hub] career truncate:', e.message));
  // ── Seed secondary schools if none exist ───────────────────────────────────
  pool.query("SELECT COUNT(*) as cnt FROM eduhub_institutions WHERE type='secondary'").then(r => {
    if (parseInt(r.rows[0].cnt) === 0) {
      const schools = [
        // ── Kigali City ──────────────────────────────────────────────────────
        { name: 'Lycée de Kicukiro APADE', province: 'Kigali City', district: 'Kicukiro', sector: 'Kicukiro', is_public: true, is_boarding: true, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A public secondary school in Kicukiro District offering sciences and humanities.' },
        { name: 'Ecole Française Antoine de Saint Exupéry', province: 'Kigali City', district: 'Gasabo', sector: 'Kibagabaga', is_public: false, is_boarding: false, is_day: true, curriculum: 'French National Curriculum', description: 'The French international school in Kigali, offering education from kindergarten to high school following the French curriculum.' },
        { name: 'École Belge de Kigali', province: 'Kigali City', district: 'Gasabo', sector: 'Ndera', is_public: false, is_boarding: false, is_day: true, curriculum: 'Belgian National Curriculum', description: 'Belgian international school providing quality education in Kigali.' },
        { name: 'Excella School', province: 'Kigali City', district: 'Gasabo', sector: 'Kimironko', is_public: false, is_boarding: false, is_day: true, curriculum: 'Cambridge International', description: 'A private school offering international standard education in Kigali.' },
        { name: 'Hope Academy Rwanda', province: 'Kigali City', district: 'Nyarugenge', sector: 'Nyarugenge', is_public: false, is_boarding: true, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A private secondary school committed to academic excellence and character development.' },
        { name: 'International School of Kigali', province: 'Kigali City', district: 'Gasabo', sector: 'Ndera', is_public: false, is_boarding: false, is_day: true, curriculum: 'International Baccalaureate (IB)', description: 'An international school offering IB programs to students in Kigali.' },
        { name: 'Kigali International Community School', province: 'Kigali City', district: 'Gasabo', sector: 'Cacica', is_public: false, is_boarding: false, is_day: true, curriculum: 'American International', description: 'A Christian international school offering American-based curriculum in Kigali.' },
        { name: 'AIS Rwanda (American International School)', province: 'Kigali City', district: 'Gasabo', sector: 'Masoro', is_public: false, is_boarding: false, is_day: true, curriculum: 'American International', description: 'American International School providing quality education with a global perspective.' },
        { name: 'Blooming Buds School', province: 'Kigali City', district: 'Gasabo', sector: 'Kacyiru', is_public: false, is_boarding: false, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A private school in Kacyiru offering nursery and primary education.' },
        { name: 'College Ami Des Enfants', province: 'Kigali City', district: 'Kicukiro', sector: 'Gatenga', is_public: false, is_boarding: false, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A private secondary school focused on child-centered education.' },
        { name: 'College de l\'Espoir de Gasogi', province: 'Kigali City', district: 'Gasabo', sector: 'Gasogi', is_public: true, is_boarding: false, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A secondary school in Gasabo District providing quality education.' },
        { name: 'College Saint Andre', province: 'Kigali City', district: 'Nyarugenge', sector: 'Nyamirambo', is_public: true, is_boarding: true, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A well-known public secondary school in Nyamirambo offering sciences and humanities.' },
        { name: 'La Colombière School', province: 'Kigali City', district: 'Nyarugenge', sector: 'Nyamirambo', is_public: false, is_boarding: false, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A private secondary school in Kigali with a strong academic reputation.' },
        { name: 'Doves Montessori School', province: 'Kigali City', district: 'Gasabo', sector: 'Kacyiru', is_public: false, is_boarding: false, is_day: true, curriculum: 'Montessori', description: 'A Montessori-based school offering holistic education for young learners.' },
        { name: 'The Earth School', province: 'Kigali City', district: 'Gasabo', sector: 'Kibagabaga', is_public: false, is_boarding: false, is_day: true, curriculum: 'International Montessori', description: 'The International Montessori School of Rwanda, offering child-centered education.' },
        { name: 'Fruits of Hope Academy', province: 'Kigali City', district: 'Kicukiro', sector: 'Gahanga', is_public: false, is_boarding: false, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A private academy focused on nurturing future leaders.' },
        { name: 'Blue Lakes International School (BLIS)', province: 'Kigali City', district: 'Gasabo', sector: 'Kimihurura', is_public: false, is_boarding: false, is_day: true, curriculum: 'Cambridge International', description: 'An international school offering Cambridge curriculum in Kigali.' },
        { name: 'Green Hills Academy', province: 'Kigali City', district: 'Gasabo', sector: 'Ndera', is_public: false, is_boarding: true, is_day: true, curriculum: 'Cambridge International', description: 'A prestigious international school in Kigali offering Cambridge IGCSE and A-Level programs.' },
        { name: 'Groupe Scolaire ADB', province: 'Kigali City', district: 'Nyarugenge', sector: 'Muhima', is_public: true, is_boarding: false, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A public group scolaire offering primary and secondary education.' },
        { name: 'Groupe Scolaire Apred Ndera', province: 'Kigali City', district: 'Gasabo', sector: 'Ndera', is_public: true, is_boarding: false, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A public group scolaire in Ndera providing quality education.' },
        { name: 'GS Aiper Nyandungu', province: 'Kigali City', district: 'Gasabo', sector: 'Nyandungu', is_public: true, is_boarding: false, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A public group scolaire serving the Nyandungu community.' },
        { name: 'Hagos International School', province: 'Kigali City', district: 'Gasabo', sector: 'Remera', is_public: false, is_boarding: false, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A private international school offering quality education in Kigali.' },
        { name: 'New Vision High School', province: 'Kigali City', district: 'Kicukiro', sector: 'Kagarama', is_public: false, is_boarding: false, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A private secondary school committed to academic excellence.' },
        { name: 'Petit Séminaire Saint Vincent Ndera', province: 'Kigali City', district: 'Gasabo', sector: 'Ndera', is_public: true, is_boarding: true, is_day: false, curriculum: 'Rwandan National Curriculum', description: 'A Catholic seminary school in Ndera with a long tradition of academic excellence.' },
        { name: 'Riviera High School', province: 'Kigali City', district: 'Gasabo', sector: 'Kimihurura', is_public: false, is_boarding: true, is_day: true, curriculum: 'Cambridge International', description: 'A private high school offering Cambridge IGCSE and A-Level programs.' },
        { name: 'Saint Ignatius High School Kibagabaga', province: 'Kigali City', district: 'Gasabo', sector: 'Kibagabaga', is_public: false, is_boarding: false, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A private Catholic high school in Kibagabaga.' },
        { name: 'SOS Hermann Gmeiner Technical High School', province: 'Kigali City', district: 'Gasabo', sector: 'Kagugu', is_public: true, is_boarding: true, is_day: true, curriculum: 'Technical and Vocational', description: 'A technical secondary school run by SOS Children\'s Villages, offering TVET programs.' },
        { name: 'STAR School', province: 'Kigali City', district: 'Gasabo', sector: 'Masoro', is_public: false, is_boarding: true, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A private school in Masoro providing quality education to rural communities.' },
        { name: 'Wellspring Academy', province: 'Kigali City', district: 'Gasabo', sector: 'Simba', is_public: false, is_boarding: false, is_day: true, curriculum: 'Christian International', description: 'A Christian international school offering quality education in Kigali.' },
        { name: 'White Dove Girls School', province: 'Kigali City', district: 'Nyarugenge', sector: 'Gitega', is_public: false, is_boarding: true, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A private girls\' school dedicated to empowering young women through education.' },
        { name: 'King David Academy', province: 'Kigali City', district: 'Kicukiro', sector: 'Kagarama', is_public: false, is_boarding: false, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A private academy offering quality secondary education.' },
        { name: 'Ishuri ry\'incuke', province: 'Kigali City', district: 'Nyarugenge', sector: 'Nyarugenge', is_public: true, is_boarding: false, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A nursery and early childhood education center.' },
        { name: 'Ishuri Mpuzamahanga rya Saint Paul (SPIS)', province: 'Kigali City', district: 'Nyarugenge', sector: 'Muhima', is_public: false, is_boarding: false, is_day: true, curriculum: 'International', description: 'Saint Paul International School offering international standard education.' },

        // ── Western Province (Intara y'Iburengerazuba) ──────────────────────
        { name: 'College De Gisenyi Inyemeramihigo', province: 'Western Province', district: 'Rubavu', sector: 'Gisenyi', is_public: true, is_boarding: true, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A public secondary school in Gisenyi offering sciences and humanities.' },
        { name: 'ETO Mibirizi', province: 'Western Province', district: 'Karongi', sector: 'Mibirizi', is_public: true, is_boarding: true, is_day: true, curriculum: 'Technical and Vocational', description: 'A technical secondary school offering TVET programs in Karongi District.' },
        { name: 'Ecole Agricole et Vétérinaire de Ntendezi', province: 'Western Province', district: 'Nyamasheke', sector: 'Ntendezi', is_public: true, is_boarding: true, is_day: true, curriculum: 'Agricultural and Veterinary', description: 'A specialized school offering agricultural and veterinary education.' },
        { name: 'Lycée Notre Dame de Nyundo', province: 'Western Province', district: 'Rubavu', sector: 'Nyundo', is_public: true, is_boarding: true, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A well-known public secondary school in Nyundo with strong academic tradition.' },
        { name: 'Gisenyi Adventist Secondary School (GASS)', province: 'Western Province', district: 'Rubavu', sector: 'Gisenyi', is_public: false, is_boarding: true, is_day: true, curriculum: 'Adventist Education', description: 'A Seventh-day Adventist secondary school in Gisenyi.' },
        { name: 'Ecole de Sciences de Gisenyi (ESG)', province: 'Western Province', district: 'Rubavu', sector: 'Gisenyi', is_public: true, is_boarding: true, is_day: true, curriculum: 'Science-focused', description: 'A public science-focused secondary school in Gisenyi.' },
        { name: 'Groupe Scolaire Saint Joseph Birambo', province: 'Western Province', district: 'Karongi', sector: 'Birambo', is_public: true, is_boarding: true, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A Catholic group scolaire in Karongi District.' },
        { name: 'Groupe Scolaire Gihundwe', province: 'Western Province', district: 'Nyamasheke', sector: 'Gihundwe', is_public: true, is_boarding: true, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A public group scolaire in Nyamasheke District.' },
        { name: 'Ecole Secondaire Gishoma', province: 'Western Province', district: 'Nyamasheke', sector: 'Gishoma', is_public: true, is_boarding: false, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A public secondary school in Gishoma sector.' },
        { name: 'Groupe Scolaire Rwinzuki', province: 'Western Province', district: 'Rubavu', sector: 'Rwinzuki', is_public: true, is_boarding: true, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A public group scolaire in Rubavu District.' },
        { name: 'St Joseph Nyamasheke', province: 'Western Province', district: 'Nyamasheke', sector: 'Nyamasheke', is_public: false, is_boarding: true, is_day: true, curriculum: 'Catholic Education', description: 'A Catholic secondary school in Nyamasheke District.' },
        { name: 'Butambamo Secondary School', province: 'Western Province', district: 'Rusizi', sector: 'Butambamo', is_public: true, is_boarding: false, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A public secondary school in Rusizi District.' },
        { name: 'Nkombo Secondary School', province: 'Western Province', district: 'Rusizi', sector: 'Nkombo', is_public: true, is_boarding: false, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A secondary school on Nkombo Island in Lake Kivu.' },
        { name: 'St Matthew\'s School Rusizi', province: 'Western Province', district: 'Rusizi', sector: 'Rusizi', is_public: false, is_boarding: true, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A private secondary school in Rusizi District.' },
        { name: 'St Matthew\'s School Nyamasheke', province: 'Western Province', district: 'Nyamasheke', sector: 'Nyamasheke', is_public: false, is_boarding: true, is_day: true, curriculum: 'Rwandan National Curriculum', description: 'A private secondary school in Nyamasheke District.' },
      ];
      schools.forEach(s => {
        pool.query(
          `INSERT INTO eduhub_institutions (name, type, description, province, district, sector, is_public, is_boarding, is_day, curriculum)
           VALUES ($1,'secondary',$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
          [s.name, s.description, s.province, s.district, s.sector, s.is_public, s.is_boarding, s.is_day, s.curriculum]
        ).catch(e => console.error('[education-hub] seed school:', e.message));
      });
      console.log('[education-hub] Seeded', schools.length, 'secondary schools');
    }
  }).catch(e => console.error('[education-hub] school seed check:', e.message));

}).catch(e => console.error('[education-hub] schema:', e.message));

// ── Gemini AI helper ──────────────────────────────────────────────────────────
async function callGemini(prompt, maxTokens = 1000) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ── Search institutions ──────────────────────────────────────────────────────
router.get('/institutions', async (req, res) => {
  try {
    const { type, province, search, is_public, sort, limit, offset } = req.query;
    let query = `SELECT * FROM eduhub_institutions WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (type) { query += ` AND type=$${idx++}`; params.push(type); }
    if (province) { query += ` AND province ILIKE $${idx++}`; params.push(`%${province}%`); }
    if (is_public !== undefined) { query += ` AND is_public=$${idx++}`; params.push(is_public === 'true'); }
    if (search) {
      query += ` AND (name ILIKE $${idx} OR description ILIKE $${idx} OR province ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }

    query += sort === 'rating' ? ` ORDER BY rating DESC` : ` ORDER BY is_featured DESC, created_at DESC`;
    const lim = Math.min(parseInt(limit) || 20, 100);
    const off = parseInt(offset) || 0;
    query += ` LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(lim, off);

    const result = await pool.query(query, params);
    const totalRes = await pool.query(`SELECT COUNT(*) as total FROM eduhub_institutions WHERE 1=1${type ? ' AND type=$1' : ''}${search ? ` AND (name ILIKE '%${search}%' OR description ILIKE '%${search}%')` : ''}`, type ? [type] : []);
    res.json({ institutions: result.rows, total: parseInt(totalRes.rows[0].total) });
  } catch (err) {
    console.error('[eduhub/institutions]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Get featured institutions ────────────────────────────────────────────────
router.get('/featured', async (req, res) => {
  try {
    const { type } = req.query;
    let query = `SELECT * FROM eduhub_institutions WHERE is_featured=TRUE`;
    const params = [];
    if (type) { query += ` AND type=$1`; params.push(type); }
    query += ` ORDER BY rating DESC LIMIT 10`;
    const result = await pool.query(query, params);
    res.json({ institutions: result.rows });
  } catch (err) {
    console.error('[eduhub/featured]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Get single institution with full details ─────────────────────────────────
router.get('/institutions/:id', async (req, res) => {
  try {
    const inst = await pool.query('SELECT * FROM eduhub_institutions WHERE id=$1', [req.params.id]);
    if (inst.rows.length === 0) return res.status(404).json({ error: 'Institution not found.' });

    const [programs, scholarships, events, news, gallery] = await Promise.all([
      pool.query('SELECT * FROM eduhub_programs WHERE institution_id=$1 ORDER BY created_at DESC', [req.params.id]),
      pool.query('SELECT * FROM eduhub_scholarships WHERE institution_id=$1 ORDER BY deadline DESC', [req.params.id]),
      pool.query('SELECT * FROM eduhub_events WHERE institution_id=$1 ORDER BY event_date DESC LIMIT 10', [req.params.id]),
      pool.query('SELECT * FROM eduhub_news WHERE institution_id=$1 ORDER BY created_at DESC LIMIT 10', [req.params.id]),
      pool.query('SELECT * FROM eduhub_gallery WHERE institution_id=$1 ORDER BY created_at DESC', [req.params.id]),
    ]);

    res.json({
      ...inst.rows[0],
      programs: programs.rows,
      scholarships: scholarships.rows,
      events: events.rows,
      news: news.rows,
      gallery: gallery.rows,
    });
  } catch (err) {
    console.error('[eduhub/institution]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Get scholarships ─────────────────────────────────────────────────────────
router.get('/scholarships', async (req, res) => {
  try {
    const { featured, limit } = req.query;
    let query = `SELECT s.*, i.name as institution_name, i.logo_url as institution_logo FROM eduhub_scholarships s LEFT JOIN eduhub_institutions i ON i.id=s.institution_id`;
    const params = [];
    if (featured === 'true') { query += ` WHERE s.is_featured=TRUE`; }
    query += ` ORDER BY s.is_featured DESC, s.deadline ASC NULLS LAST`;
    const lim = Math.min(parseInt(limit) || 20, 100);
    query += ` LIMIT $1`;
    params.push(lim);
    const result = await pool.query(query, params);
    res.json({ scholarships: result.rows });
  } catch (err) {
    console.error('[eduhub/scholarships]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Get jobs ─────────────────────────────────────────────────────────────────
router.get('/jobs', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM eduhub_jobs ORDER BY is_featured DESC, deadline ASC NULLS LAST, created_at DESC LIMIT 50');
    res.json({ jobs: result.rows });
  } catch (err) {
    console.error('[eduhub/jobs]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Get internships ──────────────────────────────────────────────────────────
router.get('/internships', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM eduhub_internships ORDER BY is_featured DESC, deadline ASC NULLS LAST, created_at DESC LIMIT 50');
    res.json({ internships: result.rows });
  } catch (err) {
    console.error('[eduhub/internships]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Get mentorship ───────────────────────────────────────────────────────────
router.get('/mentorship', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM eduhub_mentorship ORDER BY is_available DESC, created_at DESC');
    res.json({ mentors: result.rows });
  } catch (err) {
    console.error('[eduhub/mentorship]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Get careers ──────────────────────────────────────────────────────────────
router.get('/careers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM eduhub_careers ORDER BY title');
    res.json({ careers: result.rows });
  } catch (err) {
    console.error('[eduhub/careers]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Get career questions ─────────────────────────────────────────────────────
router.get('/career-questions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM eduhub_career_questions ORDER BY order_num, id');
    res.json({ questions: result.rows });
  } catch (err) {
    console.error('[eduhub/career-questions]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Submit career assessment ─────────────────────────────────────────────────
router.post('/career-assessment', authenticateToken, async (req, res) => {
  const { answers } = req.body;
  if (!answers || !Array.isArray(answers)) {
    return res.status(400).json({ error: 'Answers array is required.' });
  }
  try {
    // Get questions to map answers to trait scores
    const questions = await pool.query('SELECT * FROM eduhub_career_questions ORDER BY order_num, id');
    if (questions.rows.length === 0) {
      return res.status(400).json({ error: 'Career questions not configured yet.' });
    }

    // Calculate trait scores
    const traitScores = {};
    questions.rows.forEach((q, i) => {
      const answerIdx = answers[i];
      if (answerIdx === undefined || answerIdx === null) return;
      const optionTraits = q.trait_scores || {};
      const selectedTraits = optionTraits[String(answerIdx)] || optionTraits[answerIdx] || {};
      Object.entries(selectedTraits).forEach(([trait, score]) => {
        traitScores[trait] = (traitScores[trait] || 0) + (score || 0);
      });
    });

    // Get all careers and match
    const careers = await pool.query('SELECT * FROM eduhub_careers ORDER BY title');
    let careerMatches = [];

    if (careers.rows.length > 0) {
      careerMatches = careers.rows.map(career => {
        const careerSkills = (career.skills_required || '').toLowerCase();
        const careerSubjects = (career.subjects_to_focus || '').toLowerCase();
        let matchScore = 50;
        Object.entries(traitScores).forEach(([trait, score]) => {
          const t = trait.toLowerCase();
          if (careerSkills.includes(t) || careerSubjects.includes(t)) {
            matchScore += score * 2;
          }
        });
        matchScore = Math.min(Math.max(matchScore, 30), 99);
        return { ...career, match_score: matchScore };
      }).sort((a, b) => b.match_score - a.match_score).slice(0, 5);
    } else {
      // Use AI to generate career recommendations
      const traitsStr = Object.entries(traitScores).map(([t, s]) => `${t}: ${s}`).join(', ');
      const prompt = `You are a career guidance AI for Rwandan students. Based on these personality trait scores: ${traitsStr}, suggest the top 5 careers. For each career, provide: title, description (1 sentence), skills_required (comma-separated), subjects_to_focus (comma-separated), future_demand (e.g. "High"), estimated_salary (e.g. "500,000-1,000,000 RWF/month"). Return as JSON array. Keep descriptions concise.`;
      const aiResponse = await callGemini(prompt, 1000);
      try {
        careerMatches = JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
        careerMatches = careerMatches.map(c => ({ ...c, match_score: 85 + Math.floor(Math.random() * 14) }));
      } catch {
        careerMatches = [
          { title: 'Software Engineer', description: 'Build software solutions', match_score: 90, skills_required: 'Programming, Problem Solving', subjects_to_focus: 'Mathematics, Computer Science', future_demand: 'High', estimated_salary: '500,000-2,000,000 RWF/month' },
          { title: 'Civil Engineer', description: 'Design infrastructure', match_score: 85, skills_required: 'Mathematics, Design', subjects_to_focus: 'Physics, Mathematics', future_demand: 'High', estimated_salary: '600,000-1,500,000 RWF/month' },
        ];
      }
    }

    // Save assessment
    const saved = await pool.query(
      `INSERT INTO eduhub_career_assessments (user_id, answers, results) VALUES ($1,$2,$3) RETURNING id`,
      [req.user.id, JSON.stringify(answers), JSON.stringify(careerMatches)]
    );

    res.json({
      assessment_id: saved.rows[0].id,
      trait_scores: traitScores,
      career_matches: careerMatches,
    });
  } catch (err) {
    console.error('[eduhub/career-assessment]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Save / unsave institution ────────────────────────────────────────────────
router.post('/save/:institutionId', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO eduhub_saves (user_id, institution_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.user.id, req.params.institutionId]
    );
    res.json({ saved: true });
  } catch (err) {
    console.error('[eduhub/save]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/save/:institutionId', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM eduhub_saves WHERE user_id=$1 AND institution_id=$2', [req.user.id, req.params.institutionId]);
    res.json({ saved: false });
  } catch (err) {
    console.error('[eduhub/unsave]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Follow / unfollow institution ────────────────────────────────────────────
router.post('/follow/:institutionId', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO eduhub_follows (user_id, institution_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.user.id, req.params.institutionId]
    );
    res.json({ following: true });
  } catch (err) {
    console.error('[eduhub/follow]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/follow/:institutionId', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM eduhub_follows WHERE user_id=$1 AND institution_id=$2', [req.user.id, req.params.institutionId]);
    res.json({ following: false });
  } catch (err) {
    console.error('[eduhub/unfollow]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Get user's saved institutions ────────────────────────────────────────────
router.get('/my-saves', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.* FROM eduhub_saves s JOIN eduhub_institutions i ON i.id=s.institution_id WHERE s.user_id=$1 ORDER BY s.created_at DESC`,
      [req.user.id]
    );
    res.json({ institutions: result.rows });
  } catch (err) {
    console.error('[eduhub/my-saves]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Submit institution claim ─────────────────────────────────────────────────
router.post('/claim/:institutionId', authenticateToken, async (req, res) => {
  const { position, representative_name, official_email, official_phone, website, national_id_url, authorization_letter_url, staff_card_url } = req.body;
  if (!position?.trim() || !representative_name?.trim() || !official_email?.trim()) {
    return res.status(400).json({ error: 'Position, representative name, and official email are required.' });
  }
  try {
    const inst = await pool.query('SELECT id, claimed_by FROM eduhub_institutions WHERE id=$1', [req.params.institutionId]);
    if (inst.rows.length === 0) return res.status(404).json({ error: 'Institution not found.' });
    if (inst.rows[0].claimed_by) return res.status(400).json({ error: 'Institution already claimed.' });

    const existing = await pool.query('SELECT id FROM eduhub_claims WHERE institution_id=$1 AND user_id=$2 AND status=$3', [req.params.institutionId, req.user.id, 'pending']);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'You already have a pending claim for this institution.' });

    const result = await pool.query(
      `INSERT INTO eduhub_claims (institution_id, user_id, position, representative_name, official_email, official_phone, website, national_id_url, authorization_letter_url, staff_card_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [req.params.institutionId, req.user.id, position, representative_name, official_email, official_phone || null, website || null, national_id_url || null, authorization_letter_url || null, staff_card_url || null]
    );
    res.status(201).json({ claim_id: result.rows[0].id, message: 'Claim submitted. Admin will review.' });
  } catch (err) {
    console.error('[eduhub/claim]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Get user's career assessment history ─────────────────────────────────────
router.get('/my-assessments', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM eduhub_career_assessments WHERE user_id=$1 ORDER BY completed_at DESC LIMIT 10',
      [req.user.id]
    );
    res.json({ assessments: result.rows });
  } catch (err) {
    console.error('[eduhub/my-assessments]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ── ADMIN: Upload institution image (banner or logo) ─────────────────────────
router.post('/admin/upload-image', authenticateToken, requireRole('admin', 'head_teacher'), eduhubUpload.fields([
  { name: 'banner', maxCount: 1 },
  { name: 'logo', maxCount: 1 },
]), async (req, res) => {
  try {
    const result = {};
    if (req.files?.banner?.[0]) result.banner_url = `/uploads/eduhub/${req.files.banner[0].filename}`;
    if (req.files?.logo?.[0]) result.logo_url = `/uploads/eduhub/${req.files.logo[0].filename}`;
    if (Object.keys(result).length === 0) return res.status(400).json({ error: 'No files uploaded.' });
    res.json(result);
  } catch (err) {
    console.error('[education-hub] upload error:', err);
    res.status(500).json({ error: 'Upload failed.' });
  }
});

// ── ADMIN: Create institution ────────────────────────────────────────────────
router.post('/admin/institutions', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { name, type, description, banner_url, logo_url, website, email, phone, province, district, sector, address, is_public, is_boarding, is_day, curriculum, is_featured, facilities, social_links } = req.body;
  if (!name?.trim() || !type) return res.status(400).json({ error: 'Name and type are required.' });
  try {
    const result = await pool.query(
      `INSERT INTO eduhub_institutions (name, type, description, banner_url, logo_url, website, email, phone, province, district, sector, address, is_public, is_boarding, is_day, curriculum, is_featured, facilities, social_links, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
      [name, type, description || null, banner_url || null, logo_url || null, website || null, email || null, phone || null,
       province || null, district || null, sector || null, address || null, is_public !== false, is_boarding || false, is_day !== false,
       curriculum || null, is_featured || false, JSON.stringify(facilities || []), JSON.stringify(social_links || {}), req.user.id]
    );
    res.status(201).json({ id: result.rows[0].id, message: 'Institution created.' });
  } catch (err) {
    console.error('[eduhub/admin/create]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Update institution ────────────────────────────────────────────────
router.put('/admin/institutions/:id', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const fields = ['name', 'description', 'banner_url', 'logo_url', 'website', 'email', 'phone', 'province', 'district', 'sector', 'address', 'is_public', 'is_boarding', 'is_day', 'curriculum', 'is_featured', 'verified', 'facilities', 'social_links'];
  const updates = [];
  const params = [req.params.id];
  let idx = 2;
  fields.forEach(f => {
    if (req.body[f] !== undefined) {
      updates.push(`${f}=$${idx++}`);
      params.push(f === 'facilities' || f === 'social_links' ? JSON.stringify(req.body[f]) : req.body[f]);
    }
  });
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update.' });
  try {
    await pool.query(`UPDATE eduhub_institutions SET ${updates.join(', ')} WHERE id=$1`, params);
    res.json({ message: 'Institution updated.' });
  } catch (err) {
    console.error('[eduhub/admin/update]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Delete institution ────────────────────────────────────────────────
router.delete('/admin/institutions/:id', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    await pool.query('DELETE FROM eduhub_institutions WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[eduhub/admin/delete]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Add program ───────────────────────────────────────────────────────
router.post('/admin/institutions/:id/programs', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { name, faculty, duration, degree, entry_requirements, fees, intake, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Program name required.' });
  try {
    const result = await pool.query(
      `INSERT INTO eduhub_programs (institution_id, name, faculty, duration, degree, entry_requirements, fees, intake, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [req.params.id, name, faculty || null, duration || null, degree || null, entry_requirements || null, fees || null, intake || null, description || null]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error('[eduhub/admin/program]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Add scholarship ───────────────────────────────────────────────────
router.post('/admin/institutions/:id/scholarships', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { title, description, amount, eligibility, deadline, link, is_featured } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title required.' });
  try {
    const result = await pool.query(
      `INSERT INTO eduhub_scholarships (institution_id, title, description, amount, eligibility, deadline, link, is_featured) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [req.params.id, title, description || null, amount || null, eligibility || null, deadline || null, link || null, is_featured || false]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error('[eduhub/admin/scholarship]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Add event ─────────────────────────────────────────────────────────
router.post('/admin/institutions/:id/events', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { title, description, event_date, location, image_url } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title required.' });
  try {
    const result = await pool.query(
      `INSERT INTO eduhub_events (institution_id, title, description, event_date, location, image_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [req.params.id, title, description || null, event_date || null, location || null, image_url || null]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error('[eduhub/admin/event]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Add news ──────────────────────────────────────────────────────────
router.post('/admin/institutions/:id/news', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { title, body, image_url } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title required.' });
  try {
    const result = await pool.query(
      `INSERT INTO eduhub_news (institution_id, title, body, image_url) VALUES ($1,$2,$3,$4) RETURNING id`,
      [req.params.id, title, body || null, image_url || null]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error('[eduhub/admin/news]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Add gallery image ─────────────────────────────────────────────────
router.post('/admin/institutions/:id/gallery', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { image_url, caption } = req.body;
  if (!image_url?.trim()) return res.status(400).json({ error: 'Image URL required.' });
  try {
    const result = await pool.query(
      `INSERT INTO eduhub_gallery (institution_id, image_url, caption) VALUES ($1,$2,$3) RETURNING id`,
      [req.params.id, image_url, caption || null]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error('[eduhub/admin/gallery]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: List claims ───────────────────────────────────────────────────────
router.get('/admin/claims', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, i.name as institution_name, i.type as institution_type, u.name as user_name, u.email as user_email
       FROM eduhub_claims c
       JOIN eduhub_institutions i ON i.id=c.institution_id
       JOIN users u ON u.id=c.user_id
       ORDER BY c.created_at DESC`
    );
    res.json({ claims: result.rows });
  } catch (err) {
    console.error('[eduhub/admin/claims]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Approve/reject claim ──────────────────────────────────────────────
router.post('/admin/claims/:id/:action', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { action } = req.params;
  if (!['approved', 'rejected', 'info_requested'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action.' });
  }
  const { admin_note } = req.body;
  try {
    const claim = await pool.query('SELECT * FROM eduhub_claims WHERE id=$1', [req.params.id]);
    if (claim.rows.length === 0) return res.status(404).json({ error: 'Claim not found.' });

    await pool.query('UPDATE eduhub_claims SET status=$1, admin_note=$2 WHERE id=$3', [action, admin_note || null, req.params.id]);

    if (action === 'approved') {
      await pool.query('UPDATE eduhub_institutions SET claimed_by=$1, verified=TRUE WHERE id=$2', [claim.rows[0].user_id, claim.rows[0].institution_id]);
    }

    res.json({ message: `Claim ${action}.` });
  } catch (err) {
    console.error('[eduhub/admin/claim-action]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Add career ────────────────────────────────────────────────────────
router.post('/admin/careers', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { title, description, skills_required, subjects_to_focus, future_demand, estimated_salary, video_url, category } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title required.' });
  try {
    const result = await pool.query(
      `INSERT INTO eduhub_careers (title, description, skills_required, subjects_to_focus, future_demand, estimated_salary, video_url, category) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [title, description || null, skills_required || null, subjects_to_focus || null, future_demand || null, estimated_salary || null, video_url || null, category || null]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error('[eduhub/admin/career]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Add career question ───────────────────────────────────────────────
router.post('/admin/career-questions', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { question, options, trait_scores, order_num } = req.body;
  if (!question?.trim() || !options) return res.status(400).json({ error: 'Question and options required.' });
  try {
    const result = await pool.query(
      `INSERT INTO eduhub_career_questions (question, options, trait_scores, order_num) VALUES ($1,$2,$3,$4) RETURNING id`,
      [question, JSON.stringify(options), JSON.stringify(trait_scores || {}), order_num || 0]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error('[eduhub/admin/career-question]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Add job ───────────────────────────────────────────────────────────
router.post('/admin/jobs', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { title, company, location, description, requirements, salary, link, deadline, is_featured } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title required.' });
  try {
    const result = await pool.query(
      `INSERT INTO eduhub_jobs (title, company, location, description, requirements, salary, link, deadline, is_featured) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [title, company || null, location || null, description || null, requirements || null, salary || null, link || null, deadline || null, is_featured || false]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error('[eduhub/admin/job]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Add internship ────────────────────────────────────────────────────
router.post('/admin/internships', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { title, company, location, description, requirements, duration, link, deadline, is_featured } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'Title required.' });
  try {
    const result = await pool.query(
      `INSERT INTO eduhub_internships (title, company, location, description, requirements, duration, link, deadline, is_featured) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [title, company || null, location || null, description || null, requirements || null, duration || null, link || null, deadline || null, is_featured || false]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error('[eduhub/admin/internship]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Add mentor ────────────────────────────────────────────────────────
router.post('/admin/mentors', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  const { mentor_name, mentor_title, expertise, bio, photo_url, email, linkedin, is_available } = req.body;
  if (!mentor_name?.trim()) return res.status(400).json({ error: 'Mentor name required.' });
  try {
    const result = await pool.query(
      `INSERT INTO eduhub_mentorship (mentor_name, mentor_title, expertise, bio, photo_url, email, linkedin, is_available) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [mentor_name, mentor_title || null, expertise || null, bio || null, photo_url || null, email || null, linkedin || null, is_available !== false]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    console.error('[eduhub/admin/mentor]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── ADMIN: Stats ─────────────────────────────────────────────────────────────
router.get('/admin/stats', authenticateToken, requireRole('admin', 'head_teacher'), async (req, res) => {
  try {
    const [inst, claims, scholarships, jobs, careers, mentors] = await Promise.all([
      pool.query('SELECT type, COUNT(*) as count FROM eduhub_institutions GROUP BY type'),
      pool.query('SELECT status, COUNT(*) as count FROM eduhub_claims GROUP BY status'),
      pool.query('SELECT COUNT(*) as total FROM eduhub_scholarships'),
      pool.query('SELECT COUNT(*) as total FROM eduhub_jobs'),
      pool.query('SELECT COUNT(*) as total FROM eduhub_careers'),
      pool.query('SELECT COUNT(*) as total FROM eduhub_mentorship'),
    ]);
    res.json({
      institutions: inst.rows,
      claims: claims.rows,
      total_scholarships: scholarships.rows[0].total,
      total_jobs: jobs.rows[0].total,
      total_careers: careers.rows[0].total,
      total_mentors: mentors.rows[0].total,
    });
  } catch (err) {
    console.error('[eduhub/admin/stats]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
