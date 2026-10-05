// middleware/ErrorMiddleware.js
const errorHandler = (err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    const statusCode =
        err?.statusCode ||
        (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);

    res.status(statusCode);
    res.json({
        success: false,
        message: err?.message || "Internal server error",
        stack: process.env.NODE_ENV === "production" ? null : err?.stack,
    });
};

module.exports = { errorHandler };
