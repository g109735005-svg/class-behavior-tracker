require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('./db');

async function seed() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
    console.log('Running schema...');
    await db.query(schema);

    // Seed users
    const password = await bcrypt.hash(process.env.SEED_ADMIN_PWD || 'Passw0rd123', 10);
    // Upsert admin
    await db.query(`INSERT INTO users (username, password_hash, display_name, role) VALUES ($1,$2,$3,$4)
      ON CONFLICT (username) DO NOTHING`, ['admin@example.com', password, 'Admin', 'admin']);

    const teacherPwd = await bcrypt.hash(process.env.SEED_TEACHER_PWD || 'Passw0rd123', 10);
    await db.query(`INSERT INTO users (username, password_hash, display_name, role) VALUES ($1,$2,$3,$4)
      ON CONFLICT (username) DO NOTHING`, ['teacher@example.com', teacherPwd, 'Teacher', 'teacher']);

    // Create a class and attach to teacher
    const teacherRes = await db.query("SELECT id FROM users WHERE username=$1", ['teacher@example.com']);
    const teacherId = teacherRes.rows[0].id;
    const classRes = await db.query(`INSERT INTO classes (name, teacher_id) VALUES ($1,$2) RETURNING id`, ['Class A', teacherId]);
    const classId = classRes.rows[0].id;

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
      await db.query(`INSERT INTO behavior_types (code,label,default_point) VALUES ($1,$2,$3) ON CONFLICT (code) DO NOTHING`, b);
    }

    // Insert 30 students from CSV
    const csv = fs.readFileSync(path.join(__dirname, '../students/example_students.csv'), 'utf8');
    const lines = csv.trim().split(/\r?\n/).slice(1);
    for (const line of lines) {
      const [student_no, name] = line.split(',');
      await db.query(`INSERT INTO students (class_id, student_no, name) VALUES ($1,$2,$3) ON CONFLICT (class_id,student_no) DO NOTHING`, [classId, Number(student_no), name]);
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
