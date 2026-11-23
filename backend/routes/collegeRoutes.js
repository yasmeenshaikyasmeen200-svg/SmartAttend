
const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');

// Register a new college (Public)
router.post('/register', async (req, res) => {
  try {
    const {
      college_name,
      college_code,
      email,
      phone,
      address
    } = req.body;

    if (!college_name || !college_code || !email) {
      return res.status(400).json({
        success: false,
        message: 'College name, code and email are required.'
      });
    }

    const result = await pool.query(
      `INSERT INTO colleges
       (college_name, college_code, email, phone, address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        college_name,
        college_code,
        email,
        phone || null,
        address || null
      ]
    );

    res.status(201).json({
      success: true,
      message: 'College registered successfully. Awaiting approval.',
      college: result.rows[0]
    });

  } catch (error) {
    console.error('College registration error:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'College code or email already exists.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'College registration failed.'
    });
  }
});

// Get all registered colleges (Admin only)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM colleges ORDER BY college_id DESC`
    );

    res.json({
      success: true,
      total: result.rows.length,
      colleges: result.rows
    });

  } catch (error) {
    console.error('Fetch colleges error:', error);

    res.status(500).json({
      success: false,
      message: 'Unable to fetch colleges.'
    });
  }
});

// Approve a college (Admin only)
router.put('/:id/approve', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE colleges
       SET approval_status = 'approved'
       WHERE college_id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'College not found.'
      });
    }

    res.json({
      success: true,
      message: 'College approved successfully!',
      college: result.rows[0]
    });

  } catch (error) {
    console.error('College approval error:', error);

    res.status(500).json({
      success: false,
      message: 'College approval failed.'
    });
  }
});

// Reject a college (Admin only)
router.put('/:id/reject', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE colleges
       SET approval_status = 'rejected'
       WHERE college_id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'College not found.'
      });
    }

    res.json({
      success: true,
      message: 'College rejected successfully!',
      college: result.rows[0]
    });

  } catch (error) {
    console.error('College rejection error:', error);

    res.status(500).json({
      success: false,
      message: 'College rejection failed.'
    });
  }
});

module.exports = router;
