const AuditRepository =
  require(
    "../repositories/AuditRepository"
  );

// =========================================================
// RECORD
// =========================================================

const record = async ({
  actor = null,
  actorType = "system",

  action,

  resource,

  resourceId = null,

  method = null,

  route = null,

  ipAddress = null,

  userAgent = null,

  before = null,

  after = null,

  metadata = null,
}) => {
  return AuditRepository.create({
    actor,

    actorType,

    action,

    resource,

    resourceId,

    method,

    route,

    ipAddress,

    userAgent,

    before,

    after,

    metadata,
  });
};

// =========================================================
// REQUEST AUDIT
// =========================================================

const recordRequest = async (
  req,
  {
    action,
    resource,
    resourceId = null,
    before = null,
    after = null,
    metadata = null,
  }
) => {
  return record({
    actor:
      req.user?._id || null,

    actorType:
      req.user
        ? req.user.isAdmin
          ? "admin"
          : "user"
        : "system",

    action,

    resource,

    resourceId,

    method:
      req.method,

    route:
      req.originalUrl,

    ipAddress:
      req.ip,

    userAgent:
      req.headers[
        "user-agent"
      ],

    before,

    after,

    metadata,
  });
};

module.exports = {
  record,
  recordRequest,
};