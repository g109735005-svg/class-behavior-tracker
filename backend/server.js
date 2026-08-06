require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

// Serve frontend static files
app.use('/', express.static(path.join(__dirname, '../frontend')));

// Auth
app.post('/auth/login', async (req,res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  try {
    const userRes = await db.query('SELECT id, username, password_hash, display_name, role FROM users WHERE username=$1', [username]);
    if (userRes.rows.length === 0) return res.status(401).json({ error: 'invalid credentials' });
    const user = userRes.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

function authMiddleware(req,res,next){
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'missing authorization' });
  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'invalid authorization' });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

function roleAllowed(roles){
  return (req,res,next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}

// load dashboard endpoints (defines routes that use app, authMiddleware, roleAllowed, db)
require('./dashboard_endpoints')(app, authMiddleware, roleAllowed, db);

// Get behavior types
app.get('/api/behavior-types', authMiddleware, async (req,res) => {
  const r = await db.query('SELECT id, code, label, default_point FROM behavior_types ORDER BY id');
  res.json(r.rows);
});

// Get students for a class
app.get('/api/classes/:id/students', authMiddleware, async (req,res) => {
  const classId = Number(req.params.id);
  const r = await db.query('SELECT id, class_id, student_no, name FROM students WHERE class_id=$1 ORDER BY student_no', [classId]);
  res.json(r.rows);
});

// Atomic counter increment (A+B pattern)
// POST /api/atomic-counter/increment
// body: { key: string, deltaA: number, deltaB: number }
// Returns: { key, total, valueA, valueB }
const atomicCounters = new Map(); // In-memory atomic counter store

app.post('/api/atomic-counter/increment', authMiddleware, roleAllowed(['teacher','admin']), async (req,res) => {
  const { key, deltaA, deltaB } = req.body;
  if (!key) return res.status(400).json({ error: 'key required' });
  
  try {
    // Atomic operation: ensure both A and B are updated together
    const current = atomicCounters.get(key) || { valueA: 0, valueB: 0 };
    const newValueA = (current.valueA || 0) + (deltaA || 0);
    const newValueB = (current.valueB || 0) + (deltaB || 0);
    const total = newValueA + newValueB;
    
    // Atomically update the counter
    atomicCounters.set(key, { valueA: newValueA, valueB: newValueB, total, updatedAt: new Date() });
    
    res.json({
      key,
      valueA: newValueA,
      valueB: newValueB,
      total,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// GET /api/atomic-counter/:key
// Returns current value of atomic counter
app.get('/api/atomic-counter/:key', authMiddleware, async (req,res) => {
  const { key } = req.params;
  try {
    const current = atomicCounters.get(key) || { valueA: 0, valueB: 0 };
    res.json({
      key,
      valueA: current.valueA || 0,
      valueB: current.valueB || 0,
      total: (current.valueA || 0) + (current.valueB || 0),
      timestamp: current.updatedAt ? current.updatedAt.toISOString() : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// Create record
app.post('/api/records', authMiddleware, roleAllowed(['teacher','admin']), async (req,res) => {
  const { class_id, student_id, behavior_type_id, point_delta, note, occurred_at } = req.body;
  if (!student_id || !behavior_type_id) return res.status(400).json({ error: 'missing student_id or behavior_type_id' });
  try {
    const registrar_id = req.user.id;
    const result = await db.query(
      `INSERT INTO behavior_records (class_id, student_id, behavior_type_id, point_delta, note, registrar_id, occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [class_id || null, student_id, behavior_type_id, point_delta || 0, note || null, registrar_id, occurred_at || new Date()]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// Query records
app.get('/api/records', authMiddleware, async (req,res) => {
  // Query params: class_id, student_id, date (YYYY-MM-DD)
  const { class_id, student_id, date } = req.query;
  try {
    // Students can only see their own records and only for today unless role teacher/admin
    let where = [];
    let params = [];
    let i = 1;
    if (class_id) { where.push(`r.class_id=$${i++}`); params.push(class_id); }
    if (student_id) { where.push(`r.student_id=$${i++}`); params.push(student_id); }
    if (date) {
      where.push(`date(r.occurred_at) = $${i++}`); params.push(date);
    }

    if (req.user.role === 'student') {
      // force student id
      where.push(`r.student_id=$${i++}`); params.push(req.user.id);
      // if no date provided, default to today
      if (!date) {
        where.push(`date(r.occurred_at) = current_date`);
      }
    }

    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const sql = `SELECT r.*, b.code as behavior_code, b.label as behavior_label, u.display_name as registrar_name
                 FROM behavior_records r
                 LEFT JOIN behavior_types b ON b.id=r.behavior_type_id
                 LEFT JOIN users u ON u.id = r.registrar_id
                 ${whereSql}
                 ORDER BY r.occurred_at DESC LIMIT 1000`;
    const rows = await db.query(sql, params);
    res.json(rows.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// Simple endpoint to get class id for teacher (first class)
app.get('/api/my-class', authMiddleware, async (req,res) => {
  if (req.user.role === 'teacher') {
    const r = await db.query('SELECT id, name FROM classes WHERE teacher_id=$1 LIMIT 1', [req.user.id]);
    return res.json(r.rows[0] || null);
  }
  res.json(null);
});

// Health
app.get('/health', (req,res) => res.json({ ok: true }));

// If RUN_SEED_ON_START=true in environment, attempt to run seed once during startup
if (process.env.RUN_SEED_ON_START === 'true') {
  (async () => {
    try {
      console.log('RUN_SEED_ON_START is true — running seed...');
      console.log('SEED_MARKER=2');
      const s = require('./init_seed');
      await s.seed();
      console.log('Startup seed finished.');
    } catch (e) {
      console.error('Startup seed failed:', e);
    }
  })();
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
