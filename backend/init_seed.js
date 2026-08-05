require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('./db');

async function ensureUser(username, plainPassword, displayName, role) {
  const res = await db.query('SELECT id FROM users WHERE username=$1', [username]);
  if (res.rows.length) return res.rows[0].id;
  const password_hash = await bcrypt.hash(plainPassword, 10);
  const insert = await db.query(`INSERT INTO users (username, password_hash, display_name, role) VALUES ($1,$2,$3,$4) RETURNING id`, [username, password_hash, displayName, role]);
  return insert.rows[0].id;
}

async function ensureClass(name, teacher_id) {
  const r = await db.query('SELECT id FROM classes WHERE name=$1 AND teacher_id=$2', [name, teacher_id]);
  if (r.rows.length) return r.rows[0].id;
  const inserted = await db.query('INSERT INTO classes (name, teacher_id) VALUES ($1,$2) RETURNING id', [name, teacher_id]);
  return inserted.rows[0].id;
}

async function ensureBehavior(code,label,default_point){
  const r = await db.query('SELECT id FROM behavior_types WHERE code=$1', [code]);
  if (r.rows.length) return r.rows[0].id;
  const ins = await db.query('INSERT INTO behavior_types (code,label,default_point) VALUES ($1,$2,$3) RETURNING id', [code,label,default_point]);
  return ins.rows[0].id;
}

async function ensureStudent(class_id, student_no, name){
  const r = await db.query('SELECT id FROM students WHERE class_id=$1 AND student_no=$2', [class_id, student_no]);
  if (r.rows.length) return r.rows[0].id;
  const ins = await db.query('INSERT INTO students (class_id, student_no, name) VALUES ($1,$2,$3) RETURNING id', [class_id, student_no, name]);
  return ins.rows[0].id;
}

async function seed() {
  try {
    const schemaPath = path.join(__dirname, '../db/schema.sql');
    if (fs.existsSync(schemaPath)){
      const schema = fs.readFileSync(schemaPath, 'utf8');
      console.log('Running schema...');
      await db.query(schema);
    } else {
      console.log('No schema.sql found, skipping schema run');
    }

    // Create admin and teacher (use SEED_* env if present)
    const adminPwd = process.env.SEED_ADMIN_PWD || 'Passw0rd123';
    const teacherPwd = process.env.SEED_TEACHER_PWD || 'Passw0rd123';

    const adminId = await ensureUser('admin@example.com', adminPwd, 'Admin', 'admin');
    const teacherId = await ensureUser('teacher@example.com', teacherPwd, 'Teacher', 'teacher');

    // Create a class and attach to teacher
    const classId = await ensureClass('Class A', teacherId);

    // behavior types
    const behaviors = [
      ['add_point','加分',1],
      ['deduct_point','扣分',-1],
      ['asked_question','問問題',0],
      ['volunteered_answer','主動回答問題',1],
      ['spoke_without_hand','未舉手發言',-1],
      ['lottery_attempt','抽籤嘗試',0]
    ];
    for (const b of behaviors) {
      await ensureBehavior(b[0], b[1], b[2]);
    }

    // Insert students from CSV if available
    const csvPath = path.join(__dirname, '../students/example_students.csv');
    if (fs.existsSync(csvPath)){
      const csv = fs.readFileSync(csvPath, 'utf8');
      const lines = csv.trim().split(/\r?\n/).slice(1);
      for (const line of lines) {
        const [student_no, name] = line.split(',');
        await ensureStudent(classId, Number(student_no), name);
      }
    } else {
      console.log('No students CSV found, skipping student seed');
    }

    console.log('Seeding completed.');
  } catch (err) {
    console.error('Seed error', err);
    throw err;
  }
}

// If run directly, execute and exit with code
if (require.main === module) {
  seed().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { seed };
