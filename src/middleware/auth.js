
const jwt = require("jsonwebtoken");

const protect = (req, res, next) => {

  // 1. Check if token exists in request header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ 
      success: false, 
      message: "Not authorized. Please login first!" 
    });
  }

  try {
    // 2. Extract token from header
    const token = authHeader.split(" ")[1];

    // 3. Verify token is valid
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. Attach user info to request
    req.user = decoded;

    // 5. Move to next step
    next();

  } catch (err) {
    return res.status(401).json({ 
      success: false, 
      message: "Invalid or expired token. Please login again!" 
    });
  }
};
const adminOnly = (req, res, next) => {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Admin access required."
    });
  }
  next();
};

module.exports = { protect, adminOnly };