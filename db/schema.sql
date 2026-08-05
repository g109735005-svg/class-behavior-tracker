-- users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin','teacher','student')),
  created_at TIMESTAMP DEFAULT now()
);

-- classes
CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  teacher_id INTEGER REFERENCES users(id)
);

-- students
CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  class_id INTEGER REFERENCES classes(id),
  student_no INTEGER,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- behavior_types
CREATE TABLE IF NOT EXISTS behavior_types (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE,
  label TEXT,
  default_point INTEGER DEFAULT 0
);

-- behavior_records
CREATE TABLE IF NOT EXISTS behavior_records (
  id SERIAL PRIMARY KEY,
  class_id INTEGER REFERENCES classes(id),
  student_id INTEGER REFERENCES students(id) NOT NULL,
  behavior_type_id INTEGER REFERENCES behavior_types(id) NOT NULL,
  point_delta INTEGER DEFAULT 0,
  note TEXT,
  registrar_id INTEGER REFERENCES users(id) NOT NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT now(),
  created_at TIMESTAMP DEFAULT now()
);

-- lottery_attempts
CREATE TABLE IF NOT EXISTS lottery_attempts (
  id SERIAL PRIMARY KEY,
  record_id INTEGER REFERENCES behavior_records(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  awarded_points INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);
