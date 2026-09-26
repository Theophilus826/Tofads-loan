const crypto = require("crypto");

const generatePaymentReference = () => {
  const timestamp =
    Date.now().toString(36);

  const random =
    crypto
      .randomBytes(6)
      .toString("hex");

  return `REP-${timestamp}-${random}`.toUpperCase();
};

module.exports = {
  generatePaymentReference,
};