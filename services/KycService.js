
const KycRepository = require("../repositories/KycRepository");
const BankAccountRepository = require("../repositories/BankAccountRepository");
const User = require("../model/UserModel");
const PaymentProvider = require("../config/PaymentProvider");
const SmileIdentityProvider = require("../config/SmileIdentityProvider");

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const clean = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
};

const validateBvn = (bvn) => {
  const normalizedBvn = clean(bvn);

  if (!/^\d{11}$/.test(normalizedBvn)) {
    throw createError(
      "BVN must contain exactly 11 digits",
      400,
    );
  }

  return normalizedBvn;
};

const validateDateOfBirth = (dateOfBirth) => {
  const value = clean(dateOfBirth);

  if (!value) {
    throw createError(
      "dateOfBirth is required",
      400,
    );
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw createError(
      "dateOfBirth must be a valid date",
      400,
    );
  }

  return date;
};

const validateGender = (gender) => {
  const value = clean(gender).toLowerCase();

  const allowedGenders = [
    "male",
    "female",
    "other",
  ];

  if (!allowedGenders.includes(value)) {
    throw createError(
      "gender must be one of: male, female, other",
      400,
    );
  }

  return value;
};

const validateIdType = (idType) => {
  const value = clean(idType).toLowerCase();

  const allowedIdTypes = [
    "nin",
    "passport",
    "drivers_license",
    "voters_card",
  ];

  if (!allowedIdTypes.includes(value)) {
    throw createError(
      "idType must be one of: nin, passport, drivers_license, voters_card",
      400,
    );
  }

  return value;
};

/*
 * ============================================================
 * GET MY KYC
 * ============================================================
 */

const getMyKyc = async (userId) => {
  return KycRepository.findByUserId(userId);
};

/*
 * ============================================================
 * CREATE / UPDATE KYC
 * ============================================================
 */

const createOrUpdateKyc = async (
  userId,
  data = {},
) => {
  if (!userId) {
    throw createError(
      "User is required",
      401,
    );
  }

  const existingKyc =
    await KycRepository.findByUserId(userId);

  const firstName = clean(data.firstName);
  const lastName = clean(data.lastName);
  const address = clean(data.address);
  const city = clean(data.city);
  const state = clean(data.state);
  const country =
    clean(data.country) || "Nigeria";
  const idNumber = clean(data.idNumber);

  if (!firstName) {
    throw createError(
      "firstName is required",
      400,
    );
  }

  if (!lastName) {
    throw createError(
      "lastName is required",
      400,
    );
  }

  if (!address) {
    throw createError(
      "address is required",
      400,
    );
  }

  if (!city) {
    throw createError(
      "city is required",
      400,
    );
  }

  if (!state) {
    throw createError(
      "state is required",
      400,
    );
  }

  if (!idNumber) {
    throw createError(
      "idNumber is required",
      400,
    );
  }

  const dateOfBirth =
    validateDateOfBirth(
      data.dateOfBirth,
    );

  const gender =
    validateGender(data.gender);

  const idType =
    validateIdType(data.idType);

  const kycData = {
    user: userId,

    firstName,
    lastName,
    dateOfBirth,

    gender,

    address,
    city,
    state,
    country,

    idType,
    idNumber,

    status: "submitted",
    submittedAt: new Date(),

    rejectionReason: null,
    verifiedAt: null,
    verifiedBy: null,
  };

  /*
   * ==========================================================
   * BVN
   * ==========================================================
   */

  const incomingBvn = clean(data.bvn);

  if (incomingBvn) {
    const normalizedBvn =
      validateBvn(incomingBvn);

    kycData.bvn = normalizedBvn;

    kycData.bvnVerificationStatus =
      "not_started";

    kycData.bvnVerificationReference =
      null;

    kycData.bvnVerificationReason =
      null;

    kycData.bvnVerifiedAt = null;

    kycData.customerVerificationStatus =
      "not_started";

    kycData.customerVerificationReference =
      null;

    kycData.customerVerificationReason =
      null;

    kycData.customerVerifiedAt = null;

    kycData.providerCustomerCode =
      null;

    kycData.verificationProvider =
      null;

    kycData.verificationData =
      null;

    /*
     * A new BVN means previous face verification
     * must be performed again.
     */

    kycData.faceVerificationStatus =
      "not_started";

    kycData.faceVerificationReference =
      null;

    kycData.faceVerificationReason =
      null;

    kycData.faceVerifiedAt = null;

    kycData.faceVerificationProvider =
      "smile_identity";

    kycData.faceVerificationData =
      null;
  } else if (existingKyc) {
    /*
     * Preserve existing sensitive verification state.
     */

    const existingSensitiveKyc =
      await KycRepository
        .findByUserIdWithSensitiveData(
          userId,
        );

    if (existingSensitiveKyc?.bvn) {
      kycData.bvn =
        existingSensitiveKyc.bvn;
    }

    kycData.bvnVerificationStatus =
      existingSensitiveKyc
        ?.bvnVerificationStatus ||
      "not_started";

    kycData.bvnVerificationReference =
      existingSensitiveKyc
        ?.bvnVerificationReference ||
      null;

    kycData.bvnVerificationReason =
      existingSensitiveKyc
        ?.bvnVerificationReason ||
      null;

    kycData.bvnVerifiedAt =
      existingSensitiveKyc
        ?.bvnVerifiedAt ||
      null;

    kycData.customerVerificationStatus =
      existingSensitiveKyc
        ?.customerVerificationStatus ||
      "not_started";

    kycData.customerVerificationReference =
      existingSensitiveKyc
        ?.customerVerificationReference ||
      null;

    kycData.customerVerificationReason =
      existingSensitiveKyc
        ?.customerVerificationReason ||
      null;

    kycData.customerVerifiedAt =
      existingSensitiveKyc
        ?.customerVerifiedAt ||
      null;

    kycData.providerCustomerCode =
      existingSensitiveKyc
        ?.providerCustomerCode ||
      null;

    kycData.verificationProvider =
      existingSensitiveKyc
        ?.verificationProvider ||
      null;

    kycData.verificationData =
      existingSensitiveKyc
        ?.verificationData ||
      null;

    /*
     * Preserve existing face verification state when
     * ordinary KYC information is edited.
     */

    kycData.faceVerificationStatus =
      existingSensitiveKyc
        ?.faceVerificationStatus ||
      "not_started";

    kycData.faceVerificationReference =
      existingSensitiveKyc
        ?.faceVerificationReference ||
      null;

    kycData.faceVerificationReason =
      existingSensitiveKyc
        ?.faceVerificationReason ||
      null;

    kycData.faceVerifiedAt =
      existingSensitiveKyc
        ?.faceVerifiedAt ||
      null;

    kycData.faceVerificationProvider =
      existingSensitiveKyc
        ?.faceVerificationProvider ||
      "smile_identity";

    kycData.faceVerificationData =
      existingSensitiveKyc
        ?.faceVerificationData ||
      null;
  } else {
    /*
     * New KYC record without BVN.
     */

    kycData.bvn = null;

    kycData.bvnVerificationStatus =
      "not_started";

    kycData.bvnVerificationReference =
      null;

    kycData.bvnVerificationReason =
      null;

    kycData.bvnVerifiedAt = null;

    kycData.customerVerificationStatus =
      "not_started";

    kycData.customerVerificationReference =
      null;

    kycData.customerVerificationReason =
      null;

    kycData.customerVerifiedAt = null;

    kycData.providerCustomerCode =
      null;

    kycData.verificationProvider =
      null;

    kycData.verificationData =
      null;

    kycData.faceVerificationStatus =
      "not_started";

    kycData.faceVerificationReference =
      null;

    kycData.faceVerificationReason =
      null;

    kycData.faceVerifiedAt = null;

    kycData.faceVerificationProvider =
      "smile_identity";

    kycData.faceVerificationData =
      null;
  }

  /*
   * ==========================================================
   * OPTIONAL DOCUMENT / SELFIE
   * ==========================================================
   */

  if (
    data.idDocumentFront !==
    undefined
  ) {
    const idDocumentFront =
      clean(data.idDocumentFront);

    if (idDocumentFront) {
      kycData.idDocumentFront =
        idDocumentFront;
    }
  }

  if (data.selfie !== undefined) {
    const selfie =
      clean(data.selfie);

    if (selfie) {
      kycData.selfie = selfie;
    }
  }

  /*
   * ==========================================================
   * CREATE OR UPDATE
   * ==========================================================
   */

  if (!existingKyc) {
    return KycRepository.create(
      kycData,
    );
  }

  return KycRepository.updateByUserId(
    userId,
    kycData,
  );
};

/*
 * ============================================================
 * BVN VERIFICATION
 * ============================================================
 */

const startBvnVerification = async (
  userId,
  bvn,
  bankAccountId = null,
) => {
  if (!userId) {
    throw createError(
      "User is required",
      401,
    );
  }

  const normalizedBvn =
    validateBvn(bvn);

  const kyc =
    await KycRepository
      .findByUserIdWithSensitiveData(
        userId,
      );

  if (!kyc) {
    throw createError(
      "Please submit your KYC information before verifying your BVN",
      400,
    );
  }

  if (
    !kyc.firstName ||
    !kyc.lastName
  ) {
    throw createError(
      "First name and last name are required before BVN verification",
      400,
    );
  }

  /*
   * ==========================================================
   * TEST MODE
   * ==========================================================
   *
   * Enable only in development:
   *
   * KYC_BVN_TEST_MODE=true
   *
   * NEVER enable this in production.
   */

  if (
    process.env.NODE_ENV !==
      "production" &&
    process.env.KYC_BVN_TEST_MODE ===
      "true"
  ) {
    const testReference =
      `TEST-BVN-${Date.now()}`;

    const verifiedAt = new Date();

    await KycRepository.updateByUserId(
      userId,
      {
        bvn: normalizedBvn,

        bvnVerificationStatus:
          "verified",

        bvnVerificationReference:
          testReference,

        bvnVerificationReason:
          null,

        bvnVerifiedAt:
          verifiedAt,

        customerVerificationStatus:
          "verified",

        customerVerificationReference:
          testReference,

        customerVerificationReason:
          null,

        customerVerifiedAt:
          verifiedAt,

        providerCustomerCode:
          "TEST_CUSTOMER",

        verificationProvider:
          "test",

        verificationData: {
          testMode: true,
          reference:
            testReference,
          bankAccountId:
            bankAccountId ||
            null,
        },

        /*
         * Face verification is still
         * required separately.
         */

        faceVerificationStatus:
          "not_started",

        faceVerificationReference:
          null,

        faceVerificationReason:
          null,

        faceVerifiedAt: null,

        faceVerificationProvider:
          "smile_identity",

        faceVerificationData:
          null,
      },
    );

    return {
      status: "verified",
      reference:
        testReference,

      bvnLast4:
        normalizedBvn.slice(-4),

      bvnVerificationStatus:
        "verified",

      customerVerificationStatus:
        "verified",

      testMode: true,
    };
  }

  /*
   * ==========================================================
   * REAL PAYSTACK VERIFICATION
   * ==========================================================
   */

  let bankAccount;

  if (bankAccountId) {
    bankAccount =
      await BankAccountRepository
        .findVerifiedByIdWithAccountNumber(
          bankAccountId,
          userId,
        );
  } else {
    bankAccount =
      await BankAccountRepository
        .findPrimaryByUserWithAccountNumber(
          userId,
        );
  }

  if (!bankAccount) {
    throw createError(
      "Please add and verify a bank account before BVN verification",
      400,
    );
  }

  const accountNumber =
    clean(
      bankAccount.accountNumber,
    );

  const bankCode =
    clean(
      bankAccount.bankCode,
    );

  if (
    !/^\d{10}$/.test(
      accountNumber,
    )
  ) {
    throw createError(
      "The verified bank account number must contain exactly 10 digits",
      400,
    );
  }

  if (!bankCode) {
    throw createError(
      "Bank code is required for BVN verification",
      400,
    );
  }

  const user =
    await User.findById(
      userId,
    ).select(
      "email phone firstName lastName name",
    );

  if (!user) {
    throw createError(
      "User not found",
      404,
    );
  }

  const firstName =
    clean(kyc.firstName) ||
    clean(user.firstName) ||
    clean(
      user.name,
    ).split(/\s+/)[0];

  const lastName =
    clean(kyc.lastName) ||
    clean(user.lastName) ||
    clean(
      user.name,
    )
      .split(/\s+/)
      .slice(1)
      .join(" ");

  if (
    !firstName ||
    !lastName
  ) {
    throw createError(
      "Customer first name and last name are required",
      400,
    );
  }

  const customer =
    await PaymentProvider
      .createOrGetCustomer({
        email:
          clean(user.email),

        firstName,

        lastName,

        phone:
          clean(user.phone),

        metadata: {
          userId:
            String(userId),

          kycId:
            String(kyc._id),
        },
      });

  if (
    !customer?.customerCode
  ) {
    throw createError(
      "Paystack customer code was not returned",
      502,
    );
  }

  const verification =
    await PaymentProvider
      .validateCustomerIdentity({
        customerCode:
          customer.customerCode,

        firstName,

        lastName,

        bvn:
          normalizedBvn,

        accountNumber,

        bankCode,
      });

  const providerReference =
    verification?.reference ||
    verification
      ?.customer_identification_reference ||
    verification?.id ||
    null;

  await KycRepository.updateByUserId(
    userId,
    {
      bvn:
        normalizedBvn,

      bvnVerificationStatus:
        "pending",

      bvnVerificationReference:
        providerReference,

      bvnVerificationReason:
        null,

      bvnVerifiedAt:
        null,

      customerVerificationStatus:
        "pending",

      customerVerificationReference:
        providerReference,

      customerVerificationReason:
        null,

      customerVerifiedAt:
        null,

      providerCustomerCode:
        customer.customerCode,

      verificationProvider:
        "paystack",

      verificationData:
        verification || null,

      faceVerificationStatus:
        "not_started",

      faceVerificationReference:
        null,

      faceVerificationReason:
        null,

      faceVerifiedAt:
        null,

      faceVerificationProvider:
        "smile_identity",

      faceVerificationData:
        null,
    },
  );

  return {
    status: "pending",

    reference:
      providerReference,

    bvnLast4:
      normalizedBvn.slice(-4),

    bvnVerificationStatus:
      "pending",

    customerVerificationStatus:
      "pending",
  };
};

/*
 * ============================================================
 * PAYSTACK KYC WEBHOOK
 * ============================================================
 *
 * Handles:
 *
 * customeridentification.success
 * customeridentification.failed
 *
 * This webhook is received from the Product backend after
 * Paystack signature verification.
 */

const handlePaystackCustomerIdentificationWebhook =
  async (event) => {
    if (
      !event ||
      typeof event !==
        "object"
    ) {
      throw createError(
        "Invalid KYC webhook payload",
        400,
      );
    }

    const eventName =
      clean(event.event);

    if (
      eventName !==
        "customeridentification.success" &&
      eventName !==
        "customeridentification.failed"
    ) {
      throw createError(
        `Unsupported KYC webhook event: ${eventName}`,
        400,
      );
    }

    const data =
      event.data || {};

    /*
     * Paystack identification reference.
     */

    const reference =
      data.reference ||
      data.customer_identification_reference ||
      null;

    /*
     * Paystack customer code.
     */

    const customerCode =
      data.customer_code ||
      data.customer?.customer_code ||
      null;

    /*
     * --------------------------------------------------------
     * FIND KYC BY REFERENCE
     * --------------------------------------------------------
     */

    let kyc = null;

    if (reference) {
      kyc =
        await KycRepository
          .findByBvnVerificationReference(
            reference,
          );
    }

    /*
     * Fallback to the customer verification reference.
     */

    if (!kyc && reference) {
      kyc =
        await KycRepository
          .findByCustomerVerificationReference(
            reference,
          );
    }

    /*
     * Final fallback: Paystack customer code.
     */

    if (!kyc && customerCode) {
      kyc =
        await KycRepository
          .findByProviderCustomerCode(
            customerCode,
          );
    }

    /*
     * --------------------------------------------------------
     * KYC NOT FOUND
     * --------------------------------------------------------
     */

    if (!kyc) {
      console.warn(
        "⚠️ PAYSTACK KYC WEBHOOK: KYC RECORD NOT FOUND",
        {
          event:
            eventName,

          reference,

          customerCode,
        },
      );

      return {
        processed: false,

        reason:
          "KYC record not found",

        reference,

        customerCode,
      };
    }

    /*
     * --------------------------------------------------------
     * IDEMPOTENCY
     * --------------------------------------------------------
     *
     * Do not process the same successful event again.
     */

    if (
      eventName ===
        "customeridentification.success" &&
      kyc.bvnVerificationStatus ===
        "verified" &&
      kyc.customerVerificationStatus ===
        "verified"
    ) {
      return {
        processed: true,

        duplicate: true,

        status: "verified",

        kycId:
          kyc._id,

        userId:
          kyc.user,
      };
    }

    /*
     * --------------------------------------------------------
     * SUCCESS
     * --------------------------------------------------------
     */

    if (
      eventName ===
      "customeridentification.success"
    ) {
      const verifiedAt =
        new Date();

      const updatedKyc =
        await KycRepository
          .updateByUserId(
            kyc.user,
            {
              bvnVerificationStatus:
                "verified",

              bvnVerificationReference:
                reference ||
                kyc.bvnVerificationReference,

              bvnVerificationReason:
                null,

              bvnVerifiedAt:
                verifiedAt,

              customerVerificationStatus:
                "verified",

              customerVerificationReference:
                reference ||
                kyc.customerVerificationReference,

              customerVerificationReason:
                null,

              customerVerifiedAt:
                verifiedAt,

              verificationProvider:
                "paystack",

              /*
               * Store only safe webhook
               * metadata.
               */

              verificationData: {
                provider:
                  "paystack",

                event:
                  "customeridentification.success",

                eventId:
                  event.id ||
                  null,

                reference:
                  reference ||
                  null,

                customerCode:
                  customerCode ||
                  null,

                receivedAt:
                  verifiedAt,
              },
            },
          );

      console.log(
        "✅ PAYSTACK CUSTOMER IDENTIFICATION VERIFIED",
        {
          kycId:
            String(
              kyc._id,
            ),

          userId:
            String(
              kyc.user,
            ),

          reference,

          customerCode,
        },
      );

      return {
        processed: true,

        duplicate: false,

        status: "verified",

        kycId:
          updatedKyc?._id ||
          kyc._id,

        userId:
          kyc.user,

        bvnVerificationStatus:
          "verified",

        customerVerificationStatus:
          "verified",

        /*
         * Face verification remains
         * separate.
         */

        faceVerificationStatus:
          updatedKyc
            ?.faceVerificationStatus ||
          kyc.faceVerificationStatus,
      };
    }

    /*
     * --------------------------------------------------------
     * FAILED
     * --------------------------------------------------------
     */

    const reason =
      data.reason ||
      data.message ||
      data.error ||
      data.status ||
      "Paystack customer identification failed";

    const failedAt =
      new Date();

    const updatedKyc =
      await KycRepository
        .updateByUserId(
          kyc.user,
          {
            bvnVerificationStatus:
              "failed",

            bvnVerificationReference:
              reference ||
              kyc.bvnVerificationReference,

            bvnVerificationReason:
              String(reason),

            bvnVerifiedAt:
              null,

            customerVerificationStatus:
              "failed",

            customerVerificationReference:
              reference ||
              kyc.customerVerificationReference,

            customerVerificationReason:
              String(reason),

            customerVerifiedAt:
              null,

            verificationProvider:
              "paystack",

            verificationData: {
              provider:
                "paystack",

              event:
                "customeridentification.failed",

              eventId:
                event.id ||
                null,

              reference:
                reference ||
                null,

              customerCode:
                customerCode ||
                null,

              receivedAt:
                failedAt,

              reason:
                String(reason),
            },
          },
        );

    console.warn(
      "⚠️ PAYSTACK CUSTOMER IDENTIFICATION FAILED",
      {
        kycId:
          String(
            kyc._id,
          ),

        userId:
          String(
            kyc.user,
          ),

        reference,

        customerCode,

        reason:
          String(reason),
      },
    );

    return {
      processed: true,

      duplicate: false,

      status: "failed",

      kycId:
        updatedKyc?._id ||
        kyc._id,

      userId:
        kyc.user,

      bvnVerificationStatus:
        "failed",

      customerVerificationStatus:
        "failed",

      reason:
        String(reason),
    };
  };

/*
 * ============================================================
 * FACE VERIFICATION
 * ============================================================
 */

const startFaceVerification = async (
  userId,
  selfie,
) => {
  if (!userId) {
    throw createError(
      "User is required",
      401,
    );
  }

  if (!selfie) {
    throw createError(
      "Selfie image is required",
      400,
    );
  }

  const kyc =
    await KycRepository
      .findByUserIdWithSensitiveData(
        userId,
      );

  if (!kyc) {
    throw createError(
      "Please submit your KYC information before face verification",
      400,
    );
  }

  /*
   * Face verification should only happen after
   * KYC and BVN/customer verification.
   */

  if (
    kyc.status !==
    "verified"
  ) {
    throw createError(
      "Your KYC must be verified before face verification",
      400,
    );
  }

  if (
    kyc.bvnVerificationStatus !==
    "verified"
  ) {
    throw createError(
      "Your BVN must be verified before face verification",
      400,
    );
  }

  if (
    kyc.customerVerificationStatus !==
    "verified"
  ) {
    throw createError(
      "Your customer identity must be verified before face verification",
      400,
    );
  }

  if (
    kyc.faceVerificationStatus ===
    "verified"
  ) {
    return {
      status: "verified",

      reference:
        kyc.faceVerificationReference,
    };
  }

  const user =
    await User.findById(
      userId,
    ).select(
      "email phone firstName lastName name",
    );

  if (!user) {
    throw createError(
      "User not found",
      404,
    );
  }

  const firstName =
    kyc.firstName ||
    user.firstName ||
    clean(
      user.name,
    ).split(/\s+/)[0];

  const lastName =
    kyc.lastName ||
    user.lastName ||
    clean(
      user.name,
    )
      .split(/\s+/)
      .slice(1)
      .join(" ");

  if (
    !firstName ||
    !lastName
  ) {
    throw createError(
      "Customer first name and last name are required for face verification",
      400,
    );
  }

  const result =
    await SmileIdentityProvider
      .startFaceVerification({
        userId:
          String(userId),

        firstName,

        lastName,

        selfie,

        callbackUrl:
          process.env
            .SMILE_IDENTITY_CALLBACK_URL,
      });

  if (!result?.reference) {
    throw createError(
      "Face verification provider did not return a verification reference",
      502,
    );
  }

  await KycRepository
    .updateByUserId(
      userId,
      {
        faceVerificationStatus:
          result.status ===
          "verified"
            ? "verified"
            : "pending",

        faceVerificationReference:
          result.reference,

        faceVerificationReason:
          null,

        faceVerifiedAt:
          result.status ===
          "verified"
            ? new Date()
            : null,

        faceVerificationProvider:
          "smile_identity",

        faceVerificationData:
          result.providerData ||
          null,
      },
    );

  return {
    status:
      result.status ===
      "verified"
        ? "verified"
        : "pending",

    reference:
      result.reference,
  };
};

/*
 * ============================================================
 * FACE VERIFICATION WEBHOOK RESULT
 * ============================================================
 */

const handleFaceVerificationResult =
  async ({
    reference,
    status,
    reason = null,
    providerData = null,
  }) => {
    if (!reference) {
      throw createError(
        "Face verification reference is required",
        400,
      );
    }

    const normalizedStatus =
      clean(status).toLowerCase();

    let faceVerificationStatus;

    if (
      [
        "verified",
        "approved",
        "success",
        "successful",
      ].includes(
        normalizedStatus,
      )
    ) {
      faceVerificationStatus =
        "verified";
    } else if (
      [
        "failed",
        "rejected",
        "declined",
      ].includes(
        normalizedStatus,
      )
    ) {
      faceVerificationStatus =
        "failed";
    } else {
      faceVerificationStatus =
        "pending";
    }

    const update = {
      faceVerificationStatus,

      faceVerificationReference:
        reference,

      faceVerificationReason:
        reason,

      faceVerificationData:
        providerData,
    };

    if (
      faceVerificationStatus ===
      "verified"
    ) {
      update.faceVerifiedAt =
        new Date();
    } else {
      update.faceVerifiedAt =
        null;
    }

    if (
      typeof KycRepository
        .findByFaceVerificationReference !==
      "function"
    ) {
      throw createError(
        "KYC repository face-verification lookup is not configured",
        500,
      );
    }

    const kyc =
      await KycRepository
        .findByFaceVerificationReference(
          reference,
        );

    if (!kyc) {
      throw createError(
        "KYC record for face verification was not found",
        404,
      );
    }

    return KycRepository
      .updateByUserId(
        kyc.user,
        update,
      );
  };

/*
 * ============================================================
 * KYC COMPLETION
 * ============================================================
 */

const isKycComplete = async (
  userId,
) => {
  const kyc =
    await KycRepository
      .findByUserIdWithSensitiveData(
        userId,
      );

  if (!kyc) {
    return false;
  }

  const requiredFields = [
    kyc.firstName,
    kyc.lastName,
    kyc.dateOfBirth,
    kyc.gender,
    kyc.address,
    kyc.city,
    kyc.state,
    kyc.country,
    kyc.idType,
    kyc.idNumber,
  ];

  const requiredFieldsComplete =
    requiredFields.every(
      (value) => {
        if (
          value ===
            undefined ||
          value === null
        ) {
          return false;
        }

        return (
          String(value).trim() !==
          ""
        );
      },
    );

  if (
    !requiredFieldsComplete
  ) {
    return false;
  }

  return (
    kyc.status ===
      "verified" &&
    kyc.bvnVerificationStatus ===
      "verified" &&
    kyc.customerVerificationStatus ===
      "verified" &&
    kyc.faceVerificationStatus ===
      "verified"
  );
};

/*
 * ============================================================
 * VERIFICATION STATUS
 * ============================================================
 */

const getVerificationStatus =
  async (userId) => {
    const kyc =
      await KycRepository
        .findByUserIdWithSensitiveData(
          userId,
        );

    if (!kyc) {
      return {
        kycStatus:
          "not_started",

        bvnVerificationStatus:
          "not_started",

        customerVerificationStatus:
          "not_started",

        faceVerificationStatus:
          "not_started",

        isKycComplete:
          false,

        isBvnVerified:
          false,

        isCustomerVerified:
          false,

        isFaceVerified:
          false,
      };
    }

    const isBvnVerified =
      typeof kyc.isBvnVerified ===
      "function"
        ? kyc.isBvnVerified()
        : kyc.bvnVerificationStatus ===
          "verified";

    const isCustomerVerified =
      typeof kyc.isCustomerVerified ===
      "function"
        ? kyc.isCustomerVerified()
        : kyc.customerVerificationStatus ===
          "verified";

    const isFaceVerified =
      typeof kyc.isFaceVerified ===
      "function"
        ? kyc.isFaceVerified()
        : kyc.faceVerificationStatus ===
          "verified";

    return {
      kycStatus:
        kyc.status ||
        "pending",

      bvnVerificationStatus:
        kyc.bvnVerificationStatus ||
        "not_started",

      customerVerificationStatus:
        kyc.customerVerificationStatus ||
        "not_started",

      faceVerificationStatus:
        kyc.faceVerificationStatus ||
        "not_started",

      isKycComplete:
        await isKycComplete(
          userId,
        ),

      isBvnVerified,

      isCustomerVerified,

      isFaceVerified,
    };
  };

/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {
  getMyKyc,

  createOrUpdateKyc,

  startBvnVerification,

  handlePaystackCustomerIdentificationWebhook,

  startFaceVerification,

  handleFaceVerificationResult,

  isKycComplete,

  getVerificationStatus,
};

