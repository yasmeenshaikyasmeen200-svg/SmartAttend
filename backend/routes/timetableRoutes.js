const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');

// ---------- ROLE CONSTANTS ----------
const ROLES = {
  SMARTATTEND_ADMIN: 'smartattend_admin',
  COLLEGE_ADMIN: 'college_admin',
  FACULTY: 'faculty',
  STUDENT: 'student'
};

const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;  // HH:MM 24-hour

// ---------- MIDDLEWARE ----------
const isCollegeAdmin = (req, res, next) => {
  if (req.user.role !== ROLES.COLLEGE_ADMIN || !req.user.college_id) {
    return res.status(403).json({
      success: false,
      message: 'Only College Admins can manage timetables.'
    });
  }
  next();
};

const isFaculty = (req, res, next) => {
  if (req.user.role !== ROLES.FACULTY || !req.user.faculty_id || !req.user.college_id) {
    return res.status(403).json({
      success: false,
      message: 'Only faculty can view this timetable.'
    });
  }
  next();
};

const isStudent = (req, res, next) => {
  if (req.user.role !== ROLES.STUDENT || !req.user.student_id || !req.user.college_id) {
    return res.status(403).json({
      success: false,
      message: 'Only students can view this timetable.'
    });
  }
  next();
};

// ---------- VALIDATOR ----------
function validateTimetableBody(body) {
  const {
    department_id, course_id, faculty_id, classroom_id,
    subject_name, day_of_week, start_time, end_time
  } = body;

  // integers
  const deptId   = parseInt(department_id, 10);
  const courseId = parseInt(course_id, 10);
  const facId    = parseInt(faculty_id, 10);
  const roomId   = parseInt(classroom_id, 10);

  if (![deptId, courseId, facId, roomId].every(n => Number.isInteger(n) && n > 0)) {
    return { error: 'department_id, course_id, faculty_id and classroom_id must be positive integers.' };
  }

  // subject
  if (typeof subject_name !== 'string' || !subject_name.trim()) {
    return { error: 'subject_name is required.' };
  }
  if (subject_name.length > 100) {
    return { error: 'subject_name is too long (max 100).' };
  }

  // day
  if (!VALID_DAYS.includes(day_of_week)) {
    return { error: 'Invalid day_of_week. Use Monday..Sunday.' };
  }

  // time format
  if (typeof start_time !== 'string' || !TIME_REGEX.test(start_time)) {
    return { error: 'start_time must be HH:MM (24-hour).' };
  }
  if (typeof end_time !== 'string' || !TIME_REGEX.test(end_time)) {
    return { error: 'end_time must be HH:MM (24-hour).' };
  }

  // time order
  if (start_time >= end_time) {
    return { error: 'end_time must be later than start_time.' };
  }

  return {
    data: {
      department_id: deptId,
      course_id: courseId,
      faculty_id: facId,
      classroom_id: roomId,
      subject_name: subject_name.trim(),
      day_of_week,
      start_time,
      end_time
    }
  };
}

// ---------- CONFLICT CHECK ----------
// Returns the name of what's in conflict, or null if no conflict.
// Pass excludeId to skip a row (for UPDATE).
async function findConflict({ collegeId, facultyId, classroomId, day, start, end, excludeId }) {
  const params = [collegeId, day, start, end];
  let extra = '';
  if (excludeId) {
    params.push(excludeId);
    extra = ` AND timetable_id <> $${params.length}`;
  }

  // Faculty double-booked
  const facClash = await pool.query(
    `SELECT 1 FROM timetables
     WHERE college_id = $1
       AND faculty_id = $5
       AND day_of_week = $2
       AND (start_time, end_time) OVERLAPS ($3::time, $4::time)
       ${extra}`,
    [...params, facultyId]
  );
  if (facClash.rows.length) return 'faculty is already scheduled at this time';

  // Classroom double-booked
  const roomClash = await pool.query(
    `SELECT 1 FROM timetables
     WHERE college_id = $1
       AND classroom_id = $5
       AND day_of_week = $2
       AND (start_time, end_time) OVERLAPS ($3::time, $4::time)
       ${extra}`,
    [...params, classroomId]
  );
  if (roomClash.rows.length) return 'classroom is already booked at this time';

  return null;
}

// =====================================================
// CREATE TIMETABLE
// =====================================================
router.post('/', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const check = validateTimetableBody(req.body);
    if (check.error) return res.status(400).json({ success: false, message: check.error });

    const d = check.data;
    const collegeId = req.user.college_id;

    // Validate all FKs belong to this college (same EXISTS pattern you wrote)
    const related = await pool.query(
      `SELECT
         EXISTS (SELECT 1 FROM departments WHERE department_id = $1 AND college_id = $5) AS department_ok,
         EXISTS (SELECT 1 FROM courses     WHERE course_id     = $2 AND department_id = $1) AS course_ok,
         EXISTS (SELECT 1 FROM faculty     WHERE faculty_id    = $3 AND college_id = $5) AS faculty_ok,
         EXISTS (SELECT 1 FROM classrooms  WHERE classroom_id  = $4 AND college_id = $5) AS classroom_ok`,
      [d.department_id, d.course_id, d.faculty_id, d.classroom_id, collegeId]
    );

    const r = related.rows[0];
    if (!r.department_ok || !r.course_ok || !r.faculty_ok || !r.classroom_ok) {
      return res.status(400).json({
        success: false,
        message: 'One or more department, course, faculty or classroom IDs are invalid.'
      });
    }

    // Conflict check
    const conflict = await findConflict({
      collegeId,
      facultyId:   d.faculty_id,
      classroomId: d.classroom_id,
      day:         d.day_of_week,
      start:       d.start_time,
      end:         d.end_time
    });
    if (conflict) {
      return res.status(409).json({ success: false, message: `Cannot schedule: ${conflict}.` });
    }

    const result = await pool.query(
      `INSERT INTO timetables
       (college_id, department_id, course_id, faculty_id,
        classroom_id, subject_name, day_of_week, start_time, end_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        collegeId, d.department_id, d.course_id, d.faculty_id,
        d.classroom_id, d.subject_name, d.day_of_week,
        d.start_time, d.end_time
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Timetable created successfully!',
      timetable: result.rows[0]
    });

  } catch (error) {
    console.error('Create timetable error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not create timetable.'
    });
  }
});

// =====================================================
// VIEW ALL TIMETABLES - COLLEGE ADMIN
// =====================================================
router.get('/', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, d.department_name, c.course_name,
              f.full_name AS faculty_name,
              cr.classroom_name
       FROM timetables t
       JOIN departments d  ON t.department_id = d.department_id
       JOIN courses c      ON t.course_id     = c.course_id
       JOIN faculty f      ON t.faculty_id    = f.faculty_id
       JOIN classrooms cr  ON t.classroom_id  = cr.classroom_id
       WHERE t.college_id = $1
       ORDER BY t.day_of_week, t.start_time`,
      [req.user.college_id]
    );

    return res.json({
      success: true,
      count: result.rows.length,
      timetables: result.rows
    });

  } catch (error) {
    console.error('List timetables error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not fetch timetables.'
    });
  }
});

// =====================================================
// FACULTY: VIEW OWN TIMETABLE
// IMPORTANT: This route MUST stay ABOVE any future GET /:id
// =====================================================
router.get('/faculty', authMiddleware, isFaculty, async (req, res) => {
  try {
    const { day } = req.query;
    let where = `WHERE t.faculty_id=$1 AND t.college_id=$2`;
    const params = [req.user.faculty_id, req.user.college_id];

    if (day) {
      if (!VALID_DAYS.includes(day)) {
        return res.status(400).json({ success: false, message: 'Invalid day filter.' });
      }
      params.push(day);
      where += ` AND t.day_of_week = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT t.*, c.course_name, cr.classroom_name
       FROM timetables t
       JOIN courses c     ON t.course_id    = c.course_id
       JOIN classrooms cr ON t.classroom_id = cr.classroom_id
       ${where}
       ORDER BY t.day_of_week, t.start_time`,
      params
    );

    return res.json({
      success: true,
      count: result.rows.length,
      timetables: result.rows
    });

  } catch (error) {
    console.error('Faculty timetable error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not fetch faculty timetable.'
    });
  }
});

// =====================================================
// STUDENT: VIEW COURSE TIMETABLE
// IMPORTANT: This route MUST stay ABOVE any future GET /:id
// =====================================================
router.get('/student', authMiddleware, isStudent, async (req, res) => {
  try {
    const { day } = req.query;
    let where = `WHERE t.course_id = (
                   SELECT course_id FROM students
                   WHERE student_id = $1 AND college_id = $2
                 )
                 AND t.college_id = $2`;
    const params = [req.user.student_id, req.user.college_id];

    if (day) {
      if (!VALID_DAYS.includes(day)) {
        return res.status(400).json({ success: false, message: 'Invalid day filter.' });
      }
      params.push(day);
      where += ` AND t.day_of_week = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT t.*, c.course_name, f.full_name AS faculty_name,
              cr.classroom_name
       FROM timetables t
       JOIN courses c     ON t.course_id    = c.course_id
       JOIN faculty f     ON t.faculty_id   = f.faculty_id
       JOIN classrooms cr ON t.classroom_id = cr.classroom_id
       ${where}
       ORDER BY t.day_of_week, t.start_time`,
      params
    );

    return res.json({
      success: true,
      count: result.rows.length,
      timetables: result.rows
    });

  } catch (error) {
    console.error('Student timetable error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not fetch student timetable.'
    });
  }
});

// =====================================================
// UPDATE TIMETABLE
// =====================================================
router.put('/:id', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid timetable ID.' });
    }

    const check = validateTimetableBody(req.body);
    if (check.error) return res.status(400).json({ success: false, message: check.error });

    const d = check.data;
    const collegeId = req.user.college_id;

    // Ensure the timetable exists in this college
    const existing = await pool.query(
      `SELECT timetable_id FROM timetables WHERE timetable_id = $1 AND college_id = $2`,
      [id, collegeId]
    );
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Timetable not found.' });
    }

    // FK checks — your EXISTS trick, kept
    const related = await pool.query(
      `SELECT
         EXISTS (SELECT 1 FROM departments WHERE department_id = $1 AND college_id = $5) AS department_ok,
         EXISTS (SELECT 1 FROM courses     WHERE course_id     = $2 AND department_id = $1) AS course_ok,
         EXISTS (SELECT 1 FROM faculty     WHERE faculty_id    = $3 AND college_id = $5) AS faculty_ok,
         EXISTS (SELECT 1 FROM classrooms  WHERE classroom_id  = $4 AND college_id = $5) AS classroom_ok`,
      [d.department_id, d.course_id, d.faculty_id, d.classroom_id, collegeId]
    );

    const r = related.rows[0];
    if (!r.department_ok || !r.course_ok || !r.faculty_ok || !r.classroom_ok) {
      return res.status(400).json({
        success: false,
        message: 'One or more department, course, faculty or classroom IDs are invalid.'
      });
    }

    // Conflict check (exclude self)
    const conflict = await findConflict({
      collegeId,
      facultyId:   d.faculty_id,
      classroomId: d.classroom_id,
      day:         d.day_of_week,
      start:       d.start_time,
      end:         d.end_time,
      excludeId:   id
    });
    if (conflict) {
      return res.status(409).json({ success: false, message: `Cannot update: ${conflict}.` });
    }

    const result = await pool.query(
      `UPDATE timetables
       SET department_id=$1, course_id=$2, faculty_id=$3,
           classroom_id=$4, subject_name=$5, day_of_week=$6,
           start_time=$7, end_time=$8
       WHERE timetable_id=$9 AND college_id=$10
       RETURNING *`,
      [
        d.department_id, d.course_id, d.faculty_id, d.classroom_id,
        d.subject_name, d.day_of_week, d.start_time, d.end_time,
        id, collegeId
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Timetable not found.' });
    }

    return res.json({
      success: true,
      message: 'Timetable updated successfully!',
      timetable: result.rows[0]
    });

  } catch (error) {
    console.error('Update timetable error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not update timetable.'
    });
  }
});

// =====================================================
// DELETE TIMETABLE
// =====================================================
router.delete('/:id', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid timetable ID.' });
    }

    const result = await pool.query(
      `DELETE FROM timetables
       WHERE timetable_id=$1 AND college_id=$2
       RETURNING timetable_id`,
      [id, req.user.college_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Timetable not found.' });
    }

    return res.json({
      success: true,
      message: 'Timetable deleted successfully!'
    });

  } catch (error) {
    console.error('Delete timetable error:', error);

    if (error.code === '23503') {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete: attendance sessions reference this timetable.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Could not delete timetable.'
    });
  }
});

module.exports = router;
