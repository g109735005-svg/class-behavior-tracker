module.exports = function(app, authMiddleware, roleAllowed, db){
  // Dashboard endpoints for teacher analytics
  // GET /api/classes/:id/dashboard/rankings
  // GET /api/classes/:id/dashboard/points?from=YYYY-MM-DD&to=YYYY-MM-DD
  // GET /api/classes/:id/dashboard/behavior-breakdown
  // GET /api/classes/:id/dashboard/recent

  const { parseISO, formatISO } = require('date-fns');

  app.get('/api/classes/:id/dashboard/rankings', authMiddleware, roleAllowed(['teacher','admin']), async (req,res) => {
    try {
      const classId = Number(req.params.id);
      const limit = Number(req.query.limit) || 20;

      // ensure teacher owns class unless admin
      if (req.user.role === 'teacher'){
        const c = await db.query('SELECT teacher_id FROM classes WHERE id=$1', [classId]);
        if (c.rows.length === 0) return res.status(404).json({ error: 'class not found' });
        if (c.rows[0].teacher_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
      }

      const sql = `
        SELECT s.id, s.name, COALESCE(SUM(r.point_delta),0) AS points
        FROM students s
        LEFT JOIN behavior_records r ON r.student_id = s.id AND r.class_id = $1
        WHERE s.class_id = $1
        GROUP BY s.id, s.name
        ORDER BY points DESC
        LIMIT $2`;
      const rows = await db.query(sql, [classId, limit]);
      res.json(rows.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'server error' });
    }
  });

  app.get('/api/classes/:id/dashboard/points', authMiddleware, roleAllowed(['teacher','admin']), async (req,res) => {
    try {
      const classId = Number(req.params.id);
      let from = req.query.from;
      let to = req.query.to;
      if (!from) from = formatISO(new Date(Date.now() - 7*24*60*60*1000), { representation: 'date' });
      if (!to) to = formatISO(new Date(), { representation: 'date' });

      // validate and limit range to 365 days
      const fromDate = parseISO(from);
      const toDate = parseISO(to);
      const dayDiff = Math.ceil((toDate - fromDate) / (1000*60*60*24));
      if (dayDiff > 365) return res.status(400).json({ error: 'range too large' });

      if (req.user.role === 'teacher'){
        const c = await db.query('SELECT teacher_id FROM classes WHERE id=$1', [classId]);
        if (c.rows.length === 0) return res.status(404).json({ error: 'class not found' });
        if (c.rows[0].teacher_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
      }

      const sql = `
        SELECT d::date AS date, COALESCE(SUM(r.point_delta),0) AS points
        FROM generate_series($1::date, $2::date, '1 day') d
        LEFT JOIN behavior_records r ON date_trunc('day', r.occurred_at) = d AND r.class_id = $3
        GROUP BY d
        ORDER BY d
      `;
      const rows = await db.query(sql, [from, to, classId]);
      res.json(rows.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'server error' });
    }
  });

  app.get('/api/classes/:id/dashboard/behavior-breakdown', authMiddleware, roleAllowed(['teacher','admin']), async (req,res) => {
    try {
      const classId = Number(req.params.id);
      if (req.user.role === 'teacher'){
        const c = await db.query('SELECT teacher_id FROM classes WHERE id=$1', [classId]);
        if (c.rows.length === 0) return res.status(404).json({ error: 'class not found' });
        if (c.rows[0].teacher_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
      }

      const sql = `
        SELECT b.label, COALESCE(SUM(r.point_delta),0) AS points, COUNT(r.*) AS count
        FROM behavior_types b
        LEFT JOIN behavior_records r ON r.behavior_type_id = b.id AND r.class_id = $1
        GROUP BY b.label
        ORDER BY points DESC
      `;
      const rows = await db.query(sql, [classId]);
      res.json(rows.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'server error' });
    }
  });

  app.get('/api/classes/:id/dashboard/recent', authMiddleware, roleAllowed(['teacher','admin']), async (req,res) => {
    try {
      const classId = Number(req.params.id);
      const limit = Number(req.query.limit) || 50;
      if (req.user.role === 'teacher'){
        const c = await db.query('SELECT teacher_id FROM classes WHERE id=$1', [classId]);
        if (c.rows.length === 0) return res.status(404).json({ error: 'class not found' });
        if (c.rows[0].teacher_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
      }

      const sql = `
        SELECT r.id, r.point_delta, r.note, r.occurred_at, s.name as student_name, b.label as behavior_label, u.display_name as registrar_name
        FROM behavior_records r
        LEFT JOIN students s ON s.id = r.student_id
        LEFT JOIN behavior_types b ON b.id = r.behavior_type_id
        LEFT JOIN users u ON u.id = r.registrar_id
        WHERE r.class_id = $1
        ORDER BY r.occurred_at DESC
        LIMIT $2
      `;
      const rows = await db.query(sql, [classId, limit]);
      res.json(rows.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'server error' });
    }
  });
};
