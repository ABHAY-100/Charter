import jwt from "jsonwebtoken";

export const isAdmin = (req, res, next) => {
  try {
    const authorizationHeader = req.headers.authorization;

    if (!authorizationHeader) {
      throw new Error("No authorization header");
    }

    const tokenParts = authorizationHeader.split(" ");

    if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
      throw new Error("Invalid authorization header");
    }

    const token = tokenParts[1];
    const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

    if (!JWT_SECRET_KEY) {
      throw new Error("JWT secret key is not configured");
    }

    try {
      const decodedToken = jwt.verify(token, JWT_SECRET_KEY);

      // Check if user has admin role
      if (
        !decodedToken.role ||
        !Array.isArray(decodedToken.role) ||
        !decodedToken.role.some((role) => role.toLowerCase() === "admin")
      ) {
        throw new Error("Admin privileges required");
      }

      // Attach the token to the request object
      req.user = {
        accessToken: token,
      };

      next();
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new Error("Token expired");
      }

      throw new Error("Invalid token");
    }
  } catch (error) {
    // console.error('Auth Middleware Error:', error);
    if (error) {
      return res.status(401).json({
        success: false,
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: "Authentication error",
    });
  }
};

export default { isAdmin };
