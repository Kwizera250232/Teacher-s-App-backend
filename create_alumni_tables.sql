CREATE TABLE IF NOT EXISTS alumni_library (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  category TEXT,
  description TEXT,
  file_url TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_opportunities (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT,
  location TEXT,
  type TEXT,
  description TEXT,
  deadline DATE,
  link TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alumni_past_papers (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT,
  year INTEGER,
  description TEXT,
  file_url TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
