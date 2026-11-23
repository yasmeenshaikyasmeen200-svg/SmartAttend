const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');

// ---------- ROLE CONSTANTS (must match all other route files) ----------
const ROLES = {
  SMARTATTEND_ADMIN: 'smartattend_admin',
  COLLEGE_ADMIN: 'college_admin',
  FACULTY: 'faculty',
  STUDENT: 'student'
};

// ---------- MIDDLEWARE ----------
const isCollegeAdmin = (req, res, next) => {
  if (req.user.role !== ROLES.COLLEGE_ADMIN || !req.user.college_id) {
    return res.status(403).json({
      success: false,
      message: 'Only College Admin can perform this action.'
    });
  }
  next();
};

const isStudentOrFaculty = (req, res, next) => {
  const r = req.user.role;
  if ((r !== ROLES.STUDENT && r !== ROLES.FACULTY) || !req.user.college_id) {
    return res.status(403).json({
      success: false,
      message: 'Only Students and Faculty can use this route.'
    });
  }
  next();
};

// =====================================================
// COLLEGE ADMIN: SEND NOTIFICATION
// =====================================================
router.post('/', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const { title, message, target_role, target_id } = req.body;
    const collegeId = req.user.college_id;

    // --- required ---
    if (
      typeof title !== 'string' ||
      typeof message !== 'string' ||
      typeof target_role !== 'string' ||
      !title.trim() ||
      !message.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: 'Title, message and target_role are required.'
      });
    }

    // --- role whitelist ---
    if (!['students', 'faculty', 'all'].includes(target_role)) {
      return res.status(400).json({
        success: false,
        message: 'target_role must be students, faculty or all.'
      });
    }

    // --- lengths ---
    if (title.length > 150 || message.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Title (max 150) or message (max 2000) is too long.'
      });
    }

    const cleanTitle   = title.trim();
    const cleanMessage = message.trim();

    // --- target_id must be integer if provided ---
    let targetIdNum = null;
    if (target_id != null && target_id !== '') {
      targetIdNum = parseInt(target_id, 10);
      if (!Number.isInteger(targetIdNum) || targetIdNum <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid target_id.'
        });
      }
    }

    // --- target_id + 'all' is contradictory ---
    if (targetIdNum && target_role === 'all') {
      return res.status(400).json({
        success: false,
        message: "target_id cannot be used with target_role 'all'."
      });
    }

    // ---------- CASE 1: single student ----------
    if (targetIdNum && target_role === 'students') {
      const result = await pool.query(
        `INSERT INTO notifications
         (college_id, student_id, title, message)
         SELECT college_id, student_id, $3, $4
         FROM students
         WHERE college_id = $1 AND student_id = $2
         RETURNING notification_id, student_id, title, created_at`,
        [collegeId, targetIdNum, cleanTitle, cleanMessage]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Student not found in your college.'
        });
      }

      return res.status(201).json({
        success: true,
        message: 'Notification sent successfully!',
        notification: result.rows[0]
      });
    }

    // ---------- CASE 2: single faculty ----------
    if (targetIdNum && target_role === 'faculty') {
      const result = await pool.query(
        `INSERT INTO notifications
         (college_id, faculty_id, title, message)
         SELECT college_id, faculty_id, $3, $4
         FROM faculty
         WHERE college_id = $1 AND faculty_id = $2
         RETURNING notification_id, faculty_id, title, created_at`,
        [collegeId, targetIdNum, cleanTitle, cleanMessage]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Faculty not found in your college.'
        });
      }

      return res.status(201).json({
        success: true,
        message: 'Notification sent successfully!',
        notification: result.rows[0]
      });
    }

    // ---------- CASE 3: bulk ----------
    let studentCount = 0;
    let facultyCount = 0;

    if (target_role === 'students' || target_role === 'all') {
      const students = await pool.query(
        `INSERT INTO notifications
         (college_id, student_id, title, message)
         SELECT college_id, student_id, $2, $3
         FROM students
         WHERE college_id = $1`,
        [collegeId, cleanTitle, cleanMessage]
      );
      studentCount = students.rowCount;
    }

    if (target_role === 'faculty' || target_role === 'all') {
      const faculty = await pool.query(
        `INSERT INTO notifications
         (college_id, faculty_id, title, message)
         SELECT college_id, faculty_id, $2, $3
         FROM faculty
         WHERE college_id = $1`,
        [collegeId, cleanTitle, cleanMessage]
      );
      facultyCount = faculty.rowCount;
    }

    return res.status(201).json({
      success: true,
      message: 'Notifications sent successfully!',
      recipients: {
        students: studentCount,
        faculty: facultyCount,
        total: studentCount + facultyCount
      }
    });

  } catch (error) {
    console.error('Send notification error:', error);

    // If notifications table is missing a column, hint that
    if (error.code === '42703') {
      return res.status(500).json({
        success: false,
        message: 'DB schema missing column. Check notifications table structure.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error while sending notification.'
    });
  }
});

// =====================================================
// STUDENT/FACULTY: VIEW OWN NOTIFICATIONS
// =====================================================
router.get('/my', authMiddleware, isStudentOrFaculty, async (req, res) => {
  try {
    const { limit } = req.query;
    const limitNum = limit ? Math.min(parseInt(limit, 10) || 50, 200) : 50;

    let result;

    if (req.user.role === ROLES.STUDENT) {
      result = await pool.query(
        `SELECT notification_id, title, message, is_read, created_at
         FROM notifications
         WHERE student_id = $1 AND college_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [req.user.student_id, req.user.college_id, limitNum]
      );
    } else {
      // faculty
      result = await pool.query(
        `SELECT notification_id, title, message, is_read, created_at
         FROM notifications
         WHERE faculty_id = $1 AND college_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [req.user.faculty_id, req.user.college_id, limitNum]
      );
    }

    return res.json({
      success: true,
      count: result.rowCount,
      notifications: result.rows
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching notifications.'
    });
  }
});

// =====================================================
// COLLEGE ADMIN: VIEW NOTIFICATIONS SENT BY THEIR COLLEGE
// =====================================================
router.get('/', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const { is_read, target } = req.query;

    let where = `WHERE college_id = $1`;
    const params = [req.user.college_id];

    if (is_read === 'true' || is_read === 'false') {
      params.push(is_read === 'true');
      where += ` AND is_read = $${params.length}`;
    }

    if (target === 'students') {
      where += ` AND student_id IS NOT NULL AND faculty_id IS NULL`;
    } else if (target === 'faculty') {
      where += ` AND faculty_id IS NOT NULL AND student_id IS NULL`;
    }

    const result = await pool.query(
      `SELECT notification_id, student_id, faculty_id,
              title, message, is_read, created_at
       FROM notifications
       ${where}
       ORDER BY created_at DESC
       LIMIT 500`,
      params
    );

    return res.json({
      success: true,
      count: result.rowCount,
      notifications: result.rows
    });

  } catch (error) {
    console.error('List notifications error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching notifications.'
    });
  }
});

// =====================================================
// STUDENT/FACULTY: MARK OWN NOTIFICATION AS READ
// =====================================================
router.put('/:id/read', authMiddleware, isStudentOrFaculty, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid notification ID.' });
    }

    let result;

    if (req.user.role === ROLES.STUDENT) {
      result = await pool.query(
        `UPDATE notifications
         SET is_read = TRUE
         WHERE notification_id = $1
           AND student_id = $2
           AND college_id = $3
         RETURNING notification_id, is_read`,
        [id, req.user.student_id, req.user.college_id]
      );
    } else {
      result = await pool.query(
        `UPDATE notifications
         SET is_read = TRUE
         WHERE notification_id = $1
           AND faculty_id = $2
           AND college_id = $3
         RETURNING notification_id, is_read`,
        [id, req.user.faculty_id, req.user.college_id]
      );
    }

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found.'
      });
    }

    return res.json({
      success: true,
      message: 'Notification marked as read!',
      notification: result.rows[0]
    });

  } catch (error) {
    console.error('Mark notification read error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating notification.'
    });
  }
});

// =====================================================
// COLLEGE ADMIN: DELETE A NOTIFICATION
// =====================================================
router.delete('/:id', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid notification ID.' });
    }

    const result = await pool.query(
      `DELETE FROM notifications
       WHERE notification_id = $1 AND college_id = $2
       RETURNING notification_id`,
      [id, req.user.college_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found in your college.'
      });
    }

    return res.json({
      success: true,
      message: 'Notification deleted successfully!'
    });

  } catch (error) {
    console.error('Delete notification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while deleting notification.'
    });
  }
});

module.exports = router;
