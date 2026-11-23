const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');

// ---------- ROLE CONSTANTS (must match other route files) ----------
const ROLES = {
  SMARTATTEND_ADMIN: 'smartattend_admin',
  COLLEGE_ADMIN: 'college_admin',
  FACULTY: 'faculty',
  STUDENT: 'student'
};

// ---------- MIDDLEWARE: college-admin-only ----------
const isCollegeAdmin = (req, res, next) => {
  if (req.user.role !== ROLES.COLLEGE_ADMIN || !req.user.college_id) {
    return res.status(403).json({
      success: false,
      message: 'Only College Admins can manage classrooms.'
    });
  }
  next();
};

// ---------- INPUT VALIDATORS ----------
function validateClassroomBody(body) {
  const {
    classroom_name,
    building_name,
    floor_number,
    capacity,
    latitude,
    longitude,
    radius_meters
  } = body;

  if (typeof classroom_name !== 'string' || !classroom_name.trim()) {
    return { error: 'classroom_name is required.' };
  }

  if (!Number.isInteger(capacity) || capacity <= 0) {
    return { error: 'capacity must be a positive integer.' };
  }

  if (floor_number != null && !Number.isInteger(floor_number)) {
    return { error: 'floor_number must be an integer.' };
  }

  if (
    latitude  == null || longitude == null ||
    typeof latitude !== 'number' || typeof longitude !== 'number' ||
    latitude < -90 || latitude > 90 ||
    longitude < -180 || longitude > 180
  ) {
    return { error: 'Valid latitude (-90..90) and longitude (-180..180) are required.' };
  }

  if (
    radius_meters != null &&
    (!Number.isInteger(radius_meters) || radius_meters <= 0)
  ) {
    return { error: 'radius_meters must be a positive integer.' };
  }

  return {
    data: {
      classroom_name: classroom_name.trim(),
      building_name: building_name?.trim() || null,
      floor_number:  floor_number ?? null,
      capacity,
      latitude,
      longitude,
      radius_meters: radius_meters ?? 50   // sensible default
    }
  };
}

// =====================================================
// ADD CLASSROOM
// =====================================================
router.post('/', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const check = validateClassroomBody(req.body);
    if (check.error) {
      return res.status(400).json({ success: false, message: check.error });
    }

    const d = check.data;

    const result = await pool.query(
      `INSERT INTO classrooms
       (college_id, classroom_name, building_name,
        floor_number, capacity, latitude, longitude, radius_meters)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.user.college_id,
        d.classroom_name,
        d.building_name,
        d.floor_number,
        d.capacity,
        d.latitude,
        d.longitude,
        d.radius_meters
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Classroom added successfully!',
      classroom: result.rows[0]
    });

  } catch (error) {
    console.error('Add classroom error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error adding classroom.'
    });
  }
});

// =====================================================
// VIEW ALL CLASSROOMS (in own college)
// =====================================================
router.get('/', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM classrooms
       WHERE college_id = $1
       ORDER BY classroom_id`,
      [req.user.college_id]
    );

    return res.json({
      success: true,
      total: result.rows.length,
      classrooms: result.rows
    });

  } catch (error) {
    console.error('List classrooms error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching classrooms.'
    });
  }
});

// =====================================================
// VIEW ONE CLASSROOM
// =====================================================
router.get('/:id', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid classroom ID.' });
    }

    const result = await pool.query(
      `SELECT * FROM classrooms
       WHERE classroom_id = $1 AND college_id = $2`,
      [id, req.user.college_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Classroom not found in your college.'
      });
    }

    return res.json({ success: true, classroom: result.rows[0] });

  } catch (error) {
    console.error('Get classroom error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching classroom.'
    });
  }
});

// =====================================================
// UPDATE CLASSROOM
// =====================================================
router.put('/:id', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid classroom ID.' });
    }

    const check = validateClassroomBody(req.body);
    if (check.error) {
      return res.status(400).json({ success: false, message: check.error });
    }

    const d = check.data;

    const result = await pool.query(
      `UPDATE classrooms
       SET classroom_name = $1,
           building_name  = $2,
           floor_number   = $3,
           capacity       = $4,
           latitude       = $5,
           longitude      = $6,
           radius_meters  = $7,
           updated_at     = CURRENT_TIMESTAMP
       WHERE classroom_id = $8 AND college_id = $9
       RETURNING *`,
      [
        d.classroom_name,
        d.building_name,
        d.floor_number,
        d.capacity,
        d.latitude,
        d.longitude,
        d.radius_meters,
        id,
        req.user.college_id
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Classroom not found in your college.'
      });
    }

    return res.json({
      success: true,
      message: 'Classroom updated successfully!',
      classroom: result.rows[0]
    });

  } catch (error) {
    console.error('Update classroom error:', error);

    if (error.code === '42703') {   // undefined_column (e.g. updated_at doesn't exist)
      return res.status(500).json({
        success: false,
        message: 'Database schema missing column. Did you run the ALTER TABLE for classrooms?'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Error updating classroom.'
    });
  }
});

// =====================================================
// DELETE CLASSROOM
// =====================================================
router.delete('/:id', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid classroom ID.' });
    }

    const result = await pool.query(
      `DELETE FROM classrooms
       WHERE classroom_id = $1 AND college_id = $2
       RETURNING *`,
      [id, req.user.college_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Classroom not found in your college.'
      });
    }

    return res.json({
      success: true,
      message: 'Classroom deleted successfully!'
    });

  } catch (error) {
    console.error('Delete classroom error:', error);

    // Foreign-key violation (timetable/session still references it)
    if (error.code === '23503') {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete: this classroom is used by timetables or attendance sessions.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Error deleting classroom.'
    });
  }
});

module.exports = router;
