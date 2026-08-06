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

    // Also ensure simple monitor users exist (passwords are short by your request)
    // Passwords: morning=11, nap=22, clean=33, monitor=44
    await ensureUser('morning', '11', 'Morning Monitor', 'student');
    await ensureUser('nap', '22', 'Nap Monitor', 'student');
    await ensureUser('clean', '33', 'Clean Monitor', 'student');
    await ensureUser('monitor', '44', 'Class Monitor', 'student');

    // Create a class and attach to teacher
    const classId = await ensureClass('Class A', teacherId);

    // behavior types
    // Updated to match new three main categories: 加分, 股長提醒, 老師提醒
    const behaviors = [
      // 加分 (each +1)
      ['add_question','舉手發問',1],
      ['add_correct','舉手答對',1],
      ['add_group','小組加分',1],
      ['add_other','其他加分',1],

      // 股長提醒 (no point change)
      ['monitor_morning_silence','早自習要寧靜',0],
      ['monitor_respect_classmates','要尊重同學',0],
      ['monitor_quiet_study','要安靜學習',0],
      ['monitor_calm_lunch','要靜心午休',0],
      ['monitor_cleaning_dutiful','打掃要認真',0],
      ['monitor_leave_on_time','放學要確實',0],

      // 老師提醒 (no point change)
      ['teacher_raise_hand','要先舉手',0],
      ['teacher_respect','要尊重同學',0],
      ['teacher_remember_warned','提醒過要記住',0],
      ['teacher_quiet_study','要安靜學習',0],
      ['teacher_calm_lunch','要靜心午休',0]
    ];

    for (const b of behaviors){
      await ensureBehavior(b[0], b[1], b[2]);
    }

    // create students for seed (replace with provided class list)
    const existing = await db.query('SELECT id FROM students WHERE class_id=$1 LIMIT 1', [classId]);
    if (existing.rows.length === 0){
      const names = [
        '李O恩','劉O洋','戴O瑄','吳O崎','郭O禾','洪O得','賴O允','王O宇','李O衡','黃O叡',
        '莊O縢','郭O愷','李O祐','邱O懿','李O瑋','顏O桐','吳O娜','徐O恩','郭O君','張O涵',
        '包O菲','羅O喬','李O瑄','林O芸','林O茵','劉O妍','翁O緹','邱O芯','何O芸','陳O初'
      ];
      let no = 1;
      for (const n of names){
        await ensureStudent(classId, no++, n);
      }
    }

    console.log('Seed complete');
  } catch (err) {
    console.error('Seed failed', err);
    process.exit(1);
  }
}

// If this file is run directly, execute seed(). Export seed() for programmatic use as well.
if (require.main === module) {
  seed();
} else {
  module.exports = { seed };
}
