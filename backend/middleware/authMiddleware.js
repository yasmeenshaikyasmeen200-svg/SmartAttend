const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      console.error('JWT_SECRET is missing from environment variables.');
      return res.status(500).json({
        success: false,
        message: 'Server authentication configuration error.'
      });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Please login first.'
      });
    }

    const token = authHeader.slice(7).trim();  // cleaner than split

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token is missing.'
      });
    }

    const decoded = jwt.verify(token, secret);

    req.user = decoded;   // ✅ neutral for all 4 roles

    next();

  } catch (error) {
    const message =
      error.name === 'TokenExpiredError'
        ? 'Your session expired. Please login again.'
        : 'Invalid token. Please login again.';

    return res.status(401).json({ success: false, message });
  }
};

module.exports = authMiddleware;