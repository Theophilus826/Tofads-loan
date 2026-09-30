
// services/providers/SmileIdentityProvider.js

const createProviderError = (message, status = 502, providerData = null) => {
  const error = new Error(message);
  error.status = status;
  error.provider = "smile_identity";
  error.providerData = providerData;
  return error;
};

/**
 * Smile Identity adapter.
 *
 * Keep all Smile Identity-specific API calls inside this file.
 * Do not call Smile Identity directly from KycService.
 *
 * The exact Smile Identity endpoint, authentication method, request
 * payload and webhook format should be added once the provider
 * credentials/API documentation are available.
 */
const startFaceVerification = async ({
  userId,
  firstName,
  lastName,
  selfie,
  callbackUrl,
}) => {
  if (!userId) {
    throw createProviderError("User ID is required", 400);
  }

  if (!firstName || !lastName) {
    throw createProviderError(
      "Customer first name and last name are required",
      400,
    );
  }

  if (!selfie) {
    throw createProviderError("Selfie image is required", 400);
  }

  if (!process.env.SMILE_IDENTITY_PARTNER_ID) {
    throw createProviderError(
      "Smile Identity is not configured",
      503,
    );
  }

  /*
   * TODO:
   *
   * Replace this section with the official Smile Identity SDK/API
   * integration once the account credentials and provider contract
   * are available.
   *
   * Expected internal return shape:
   *
   * {
   *   reference: "provider-reference",
   *   status: "pending",
   *   providerData: {...}
   * }
   */

  throw createProviderError(
    "Smile Identity face verification integration is not configured yet",
    503,
  );
};

module.exports = {
  startFaceVerification,
};

