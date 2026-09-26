const Audit = require(
  "../model/AuditModel"
);

const create = async (
  data
) => {
  return Audit.create(
    data
  );
};

const findByResource = async (
  resource,
  resourceId
) => {
  return Audit.find({
    resource,
    resourceId,
  }).sort({
    createdAt: -1,
  });
};

module.exports = {
  create,
  findByResource,
};