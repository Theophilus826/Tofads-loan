const AuditService = require("../services/AuditService");

const STAFF_ROLES = new Set([
  "admin",
  "super_admin",
  "loan_officer",
  "risk_officer",
  "finance",
  "support",
]);

const isStaff = (user) =>
  Boolean(
    user &&
      (user.isAdmin === true || STAFF_ROLES.has(user.role)),
  );

const getResource = (segments) => {
  const adminIndex = segments.indexOf("admin");

  if (
    adminIndex >= 0 &&
    segments[adminIndex + 1] &&
    !/^[a-f\d]{24}$/i.test(segments[adminIndex + 1])
  ) {
    return segments[adminIndex + 1];
  }

  return segments[1] || segments[0] || "api";
};

const auditStaffMutations = (req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }

  res.once("finish", () => {
    const actor = req.user;

    if (!isStaff(actor)) {
      return;
    }

    const pathname = String(req.originalUrl || req.path)
      .split("?")[0];
    const segments = pathname.split("/").filter(Boolean);
    const resource = getResource(segments);
    const routeAction = segments[segments.length - 1];
    const resourceId =
      req.params?.id ||
      req.params?.userId ||
      req.params?.applicationId ||
      segments.find((segment) => /^[a-f\d]{24}$/i.test(segment)) ||
      null;

    void AuditService.record({
      actor: actor._id || actor.id,
      actorType: "admin",
      action: `${req.method.toLowerCase()}_${resource}_${routeAction || "action"}`,
      resource,
      resourceId,
      method: req.method,
      route: pathname,
      ipAddress: req.ip || null,
      userAgent: req.headers["user-agent"] || null,
      metadata: {
        statusCode: res.statusCode,
        outcome: res.statusCode < 400 ? "success" : "failure",
      },
    }).catch((error) => {
      console.error("Failed to record admin audit event:", error.message);
    });
  });

  return next();
};

module.exports = auditStaffMutations;