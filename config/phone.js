
const crypto = require("crypto");

/* =========================================================
   NORMALIZE NIGERIAN PHONE
========================================================= */

/**
 * Normalize Nigerian phone numbers to E.164 format.
 *
 * Accepted:
 *
 * 08012345678
 * 8012345678
 * 2348012345678
 * +2348012345678
 *
 * Output:
 *
 * +2348012345678
 */
const formatPhone = (phone) => {
  if (
    phone === undefined ||
    phone === null
  ) {
    return null;
  }

  let value = String(phone).trim();

  if (!value) {
    return null;
  }

  /*
   * Remove spaces, "-", "(", ")" and
   * any other non-numeric characters.
   *
   * +234 801 234 5678
   * becomes:
   *
   * 2348012345678
   */
  value = value.replace(/\D/g, "");

  /*
   * Local Nigerian format:
   *
   * 08012345678
   *
   * Remove the leading 0 and
   * add Nigeria country code.
   *
   * Result:
   *
   * 2348012345678
   */
  if (value.startsWith("0")) {
    value = `234${value.slice(1)}`;
  }

  /*
   * Local number without leading zero:
   *
   * 8012345678
   *
   * Add Nigeria country code.
   */
  else if (
    value.startsWith("7") ||
    value.startsWith("8") ||
    value.startsWith("9")
  ) {
    value = `234${value}`;
  }

  /*
   * At this point a valid Nigerian number
   * should look like:
   *
   * 2348012345678
   */

  if (!value.startsWith("234")) {
    return null;
  }

  /*
   * Nigerian mobile numbers are:
   *
   * +234
   * followed by 10 digits
   *
   * Example:
   * +2348012345678
   */
  if (!/^234[789]\d{9}$/.test(value)) {
    return null;
  }

  return `+${value}`;
};

/* =========================================================
   HASH PHONE
========================================================= */

/**
 * Hash the already-normalized phone number.
 *
 * IMPORTANT:
 * Always call formatPhone() before hashPhone().
 */
const hashPhone = (phone) => {
  const formatted = formatPhone(phone);

  if (!formatted) {
    return null;
  }

  return crypto
    .createHash("sha256")
    .update(formatted)
    .digest("hex");
};

module.exports = {
  formatPhone,
  hashPhone,
};

