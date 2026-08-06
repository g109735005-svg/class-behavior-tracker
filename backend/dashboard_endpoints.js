module.exports = function(app, authMiddleware, roleAllowed, db){
  // Dashboard endpoints for teacher analytics
  // GET /api/classes/:id/dashboard/rankings
  // GET /api/classes/:id/dashboard/points?from=YYYY-MM-DD&to=YYYY-MM-DD
  // GET /api/classes/:id/dashboard/behavior-breakdown
  // GET /api/classes/:id/dashboard/recent
  // GET /api/classes/:id/students/:studentId/export  -> CSV export of student's records (kept)
  // GET /api/classes/:id/export -> XLSX export of entire class records (with optional from/to)

  const { parseISO, formatISO } = require('date-fns');
  const ExcelJS = require('exceljs');

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

  // Export student's records as CSV (Excel-compatible)
  app.get('/api/classes/:id/students/:studentId/export', authMiddleware, roleAllowed(['teacher','admin']), async (req,res) => {
    try {
      const classId = Number(req.params.id);
      const studentId = Number(req.params.studentId);

      // ensure teacher owns class unless admin
      if (req.user.role === 'teacher'){
        const c = await db.query('SELECT teacher_id FROM classes WHERE id=$1', [classId]);
        if (c.rows.length === 0) return res.status(404).json({ error: 'class not found' });
        if (c.rows[0].teacher_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
      }

      const sql = `
        SELECT r.occurred_at, b.label as behavior_label, r.point_delta, r.note, u.display_name as registrar_name
        FROM behavior_records r
        LEFT JOIN behavior_types b ON b.id = r.behavior_type_id
        LEFT JOIN users u ON u.id = r.registrar_id
        WHERE r.class_id = $1 AND r.student_id = $2
        ORDER BY r.occurred_at ASC
      `;
      const rows = await db.query(sql, [classId, studentId]);

      // build CSV
      const escape = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v).replace(/"/g, '""');
        return '"' + s + '"';
      };
      const header = ['occurred_at','behavior_label','point_delta','note','registrar_name'];
      const csvRows = [header.join(',')];
      for (const r of rows.rows){
        csvRows.push([r.occurred_at.toISOString(), r.behavior_label, r.point_delta, r.note || '', r.registrar_name || ''].map(escape).join(','));
      }
      const csv = csvRows.join('\n');
      res.setHeader('Content-Type','text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="student_${studentId}_records.csv"`);
      res.send(csv);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'server error' });
    }
  });

  // Export entire class records as XLSX with optional from/to date filters
  app.get('/api/classes/:id/export', authMiddleware, roleAllowed(['teacher','admin']), async (req,res) => {
    try {
      const classId = Number(req.params.id);
      const from = req.query.from; // expected YYYY-MM-DD
      const to = req.query.to;     // expected YYYY-MM-DD

      // ensure teacher owns class unless admin
      if (req.user.role === 'teacher'){
        const c = await db.query('SELECT teacher_id FROM classes WHERE id=$1', [classId]);
        if (c.rows.length === 0) return res.status(404).json({ error: 'class not found' });
        if (c.rows[0].teacher_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
      }

      // build query with optional date filters
      let params = [classId];
      let where = ' WHERE r.class_id = $1';
      let idx = 2;
      if (from) { where += ` AND r.occurred_at >= $${idx++}`; params.push(from + ' 00:00:00'); }
      if (to)   { where += ` AND r.occurred_at <= $${idx++}`; params.push(to + ' 23:59:59'); }

      const sql = `
        SELECT s.student_no, s.name as student_name, r.occurred_at, b.label as behavior_label, r.point_delta, r.note, u.display_name as registrar_name
        FROM behavior_records r
        LEFT JOIN students s ON s.id = r.student_id
        LEFT JOIN behavior_types b ON b.id = r.behavior_type_id
        LEFT JOIN users u ON u.id = r.registrar_id
        ${where}
        ORDER BY s.student_no::int NULLS LAST, r.occurred_at ASC
      `;
      const rows = await db.query(sql, params);

      // build XLSX using exceljs
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Class Records');
      sheet.columns = [
        { header: 'student_no', key: 'student_no', width: 12 },
        { header: 'student_name', key: 'student_name', width: 24 },
        { header: 'occurred_at', key: 'occurred_at', width: 24 },
        { header: 'behavior_label', key: 'behavior_label', width: 24 },
        { header: 'point_delta', key: 'point_delta', width: 12 },
        { header: 'note', key: 'note', width: 40 },
        { header: 'registrar_name', key: 'registrar_name', width: 20 }
      ];

      for (const r of rows.rows){
        sheet.addRow({
          student_no: r.student_no || '',
          student_name: r.student_name || '',
          occurred_at: r.occurred_at ? new Date(r.occurred_at) : '',
          behavior_label: r.behavior_label || '',
          point_delta: r.point_delta || 0,
          note: r.note || '',
          registrar_name: r.registrar_name || ''
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="class_${classId}_records.xlsx"`);
      return res.send(Buffer.from(buffer));

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'server error' });
    }
  });

};
