const crypto = require("crypto");

const DisbursementRepository = require("../repositories/DisbursementRepository");
const LoanOfferRepository = require("../repositories/LoanOfferRepository");
const BankAccountRepository = require("../repositories/BankAccountRepository");

const {
  createRepaymentSchedule,
} = require("../services/RepaymentScheduleService");

const {
  createTransferRecipient,
  initiateTransfer,
} = require("../config/PaymentProvider");

const Loan = require("../model/Loan");
const LoanApplication = require("../model/LoanApplication");

// =========================================================
// HELPERS
// =========================================================

const createError = (
  message,
  statusCode = 400
) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const generateReference = (prefix) =>
  `${String(prefix)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")}_${Date.now()}_${crypto
    .randomBytes(6)
    .toString("hex")}`;

const getUserId = (user) => {
  return user?._id || user?.id || user;
};

// =========================================================
// BANK ACCOUNT
// =========================================================

/**
 * Get the customer's verified primary bank account.
 *
 * Disbursement requires a verified primary bank account.
 * A repayment mandate is not required to send the loan.
 */
const getVerifiedBankAccount = async (
  userId
) => {
  if (!userId) {
    throw createError(
      "Loan customer is required",
      400
    );
  }

  const bankAccount =
    await BankAccountRepository.findPrimaryForDisbursement(
      userId
    );

  if (!bankAccount) {
    throw createError(
      "Verified primary bank account not found",
      404
    );
  }

  if (
    bankAccount.isPrimary !== true
  ) {
    throw createError(
      "Bank account is not the primary account",
      400
    );
  }

  if (
    bankAccount.verificationStatus !==
    "verified"
  ) {
    throw createError(
      "Primary bank account is not verified",
      400
    );
  }

  if (
    !bankAccount.accountNumber ||
    String(
      bankAccount.accountNumber
    ).trim() === ""
  ) {
    throw createError(
      "Primary bank account number is unavailable",
      400
    );
  }

  if (
    !bankAccount.bankCode ||
    String(
      bankAccount.bankCode
    ).trim() === ""
  ) {
    throw createError(
      "Primary bank account bank code is unavailable",
      400
    );
  }

  return bankAccount;
};

// =========================================================
// LOAN
// =========================================================

/**
 * Load a loan with the relationships required
 * by the disbursement workflow.
 */
const getLoanForDisbursement = async (
  loanId
) => {
  const loan = await Loan.findById(loanId)
    .populate(
      "user",
      "firstName lastName name email phone"
    )
    .populate("loanOffer")
    .populate("loanApplication")
    .populate("loanProduct")
    .populate("mandate")
    .populate("repaymentSchedule");

  if (!loan) {
    throw createError(
      "Loan not found",
      404
    );
  }

  return loan;
};

/**
 * Validate whether a loan can enter disbursement.
 */
const validateLoanForDisbursement = async (
  loan
) => {
  if (loan.status === "completed") {
    return {
      alreadyCompleted: true,
      alreadyProcessing: false,
      loan,
    };
  }

  if (
    loan.disbursementStatus === "SUCCESS" ||
    loan.status === "active"
  ) {
    return {
      alreadyCompleted: true,
      alreadyProcessing: false,
      loan,
    };
  }

  if (
    loan.disbursementStatus ===
    "PROCESSING"
  ) {
    return {
      alreadyCompleted: false,
      alreadyProcessing: true,
      loan,
    };
  }

  if (
    loan.disbursementStatus === "REVERSED"
  ) {
    throw createError(
      "This loan has a reversed disbursement and requires review",
      400
    );
  }

  if (
    loan.status !== "pending_disbursement"
  ) {
    throw createError(
      `Loan cannot be disbursed while status is ${loan.status}`,
      400
    );
  }

  if (
    !Number.isFinite(
      Number(loan.principalAmount)
    ) ||
    Number(loan.principalAmount) <= 0
  ) {
    throw createError(
      "Invalid loan principal amount",
      400
    );
  }

  if (!loan.user) {
    throw createError(
      "Loan customer not found",
      404
    );
  }

  if (!loan.loanOffer) {
    throw createError(
      "Loan offer is missing from this loan",
      400
    );
  }

  if (!loan.loanApplication) {
    throw createError(
      "Loan application is missing from this loan",
      400
    );
  }

  return {
    alreadyCompleted: false,
    alreadyProcessing: false,
    loan,
  };
};

// =========================================================
// CLAIM LOAN
// =========================================================

/**
 * Atomically claim a loan for Paystack disbursement.
 *
 * Loan:
 *
 * pending_disbursement / PENDING
 *              ↓
 * disbursing / PROCESSING
 *
 * This prevents simultaneous Paystack/manual
 * disbursement attempts.
 */
const claimLoanForPaystack = async (
  loanId
) => {
  const reference =
    generateReference("PAYSTACK");

  const loan =
    await Loan.findOneAndUpdate(
      {
        _id: loanId,
        status: "pending_disbursement",
        disbursementStatus: "PENDING",
      },
      {
        $set: {
          status: "disbursing",
          disbursementStatus: "PROCESSING",
          disbursementMethod: "paystack",
          disbursementReference: reference,
          disbursementReason: null,
          disbursedBy: null,
        },
      },
      {
        returnDocument: "after",
      }
    )
      .populate(
        "user",
        "firstName lastName name email phone"
      )
      .populate("loanOffer")
      .populate("loanApplication")
      .populate("loanProduct")
      .populate("mandate");

  return {
    loan,
    reference,
  };
};

/**
 * Atomically claim a loan for manual disbursement.
 */
const claimLoanForManual = async (
  loanId,
  adminId
) => {
  const reference =
    generateReference("MANUAL");

  const loan =
    await Loan.findOneAndUpdate(
      {
        _id: loanId,
        status: "pending_disbursement",
        disbursementStatus: "PENDING",
      },
      {
        $set: {
          status: "disbursing",
          disbursementStatus: "PROCESSING",
          disbursementMethod: "manual",
          disbursementReference: reference,
          disbursedBy: adminId,
          disbursementReason:
            "Manual disbursement started",
        },
      },
      {
        returnDocument: "after",
      }
    )
      .populate(
        "user",
        "firstName lastName name email phone"
      )
      .populate("loanOffer")
      .populate("loanApplication")
      .populate("loanProduct")
      .populate("mandate");

  return {
    loan,
    reference,
  };
};

// =========================================================
// LOCAL DISBURSEMENT
// =========================================================

/**
 * Create a local disbursement attempt.
 *
 * IMPORTANT:
 * A previous FAILED/REVERSED attempt must not be reused.
 *
 * Only an existing pending/processing attempt for the
 * same loan is reused.
 */
const createLocalDisbursement = async ({
  loan,
  bankAccount,
  reference,
  provider,
}) => {
  const existing =
    await DisbursementRepository.findProcessingByLoan(
      loan._id
    );

  if (existing) {
    return existing;
  }

  return DisbursementRepository.create({
    user:
      loan.user?._id ||
      loan.user,

    loan: loan._id,

    loanOffer:
      loan.loanOffer?._id ||
      loan.loanOffer,

    loanApplication:
      loan.loanApplication?._id ||
      loan.loanApplication,

    bankAccount:
      bankAccount._id,

    amount:
      Number(
        loan.principalAmount || 0
      ),

    currency:
      loan.loanProduct?.currency ||
      "NGN",

    method:
      loan.disbursementMethod ||
      "paystack",

    reference,

    provider:
      provider || "paystack",

    status: "pending",

    initiatedAt: new Date(),
  });
};

// =========================================================
// REPAYMENT SCHEDULE
// =========================================================

/**
 * Create the repayment schedule exactly once and
 * link it to Loan.repaymentSchedule.
 */
const ensureRepaymentSchedule = async (
  disbursementId,
  loanId
) => {
  if (!disbursementId) {
    throw createError(
      "Disbursement ID is required to create repayment schedule",
      400
    );
  }

  if (!loanId) {
    throw createError(
      "Loan ID is required to link repayment schedule",
      400
    );
  }

  // -------------------------------------------------------
  // First check whether the loan already has a schedule.
  // -------------------------------------------------------

  const existingLoan =
    await Loan.findById(loanId)
      .select("repaymentSchedule");

  if (
    existingLoan?.repaymentSchedule
  ) {
    return existingLoan.repaymentSchedule;
  }

  try {
    // -----------------------------------------------------
    // Create schedule from successful disbursement.
    // -----------------------------------------------------

    const schedule =
      await createRepaymentSchedule(
        disbursementId
      );

    if (!schedule) {
      throw createError(
        "Repayment schedule was not created",
        500
      );
    }

    const scheduleId =
      schedule?._id ||
      schedule?.id ||
      schedule;

    if (!scheduleId) {
      throw createError(
        "Repayment schedule ID was not returned",
        500
      );
    }

    // -----------------------------------------------------
    // Link schedule to loan only if not already linked.
    // -----------------------------------------------------

    const updatedLoan =
      await Loan.findOneAndUpdate(
        {
          _id: loanId,
          $or: [
            {
              repaymentSchedule: {
                $exists: false,
              },
            },
            {
              repaymentSchedule: null,
            },
          ],
        },
        {
          $set: {
            repaymentSchedule: scheduleId,
          },
        },
        {
          returnDocument: "after",
        }
      );

    if (updatedLoan) {
      return scheduleId;
    }

    // Another request may have linked it first.
    const recoveredLoan =
      await Loan.findById(loanId)
        .select("repaymentSchedule");

    if (
      recoveredLoan?.repaymentSchedule
    ) {
      return recoveredLoan.repaymentSchedule;
    }

    throw createError(
      "Loan could not be updated with repayment schedule",
      500
    );
  } catch (error) {
    // Handle unique-index race.
    if (
      error?.code === 11000 ||
      /already exists|duplicate/i.test(
        error?.message || ""
      )
    ) {
      const loan =
        await Loan.findById(loanId)
          .select("repaymentSchedule");

      if (loan?.repaymentSchedule) {
        return loan.repaymentSchedule;
      }
    }

    throw error;
  }
};

// =========================================================
// SUCCESSFUL DISBURSEMENT
// =========================================================

/**
 * Mark Paystack disbursement successful.
 *
 * Paystack can retry webhooks, therefore this method
 * is intentionally idempotent.
 */
const markDisbursementSuccessful = async ({
  reference,
  providerResult = null,
  adminId = null,
}) => {
  const normalizedReference =
    String(reference || "").trim();

  if (!normalizedReference) {
    throw createError(
      "Disbursement reference is required",
      400
    );
  }

  const loan =
    await Loan.findOne({
      disbursementReference:
        normalizedReference,
    });

  if (!loan) {
    throw createError(
      `Loan not found for disbursement reference ${normalizedReference}`,
      404
    );
  }

  // -------------------------------------------------------
  // Already completed.
  // -------------------------------------------------------

  if (
    loan.disbursementStatus ===
      "SUCCESS" &&
    loan.status === "active"
  ) {
    const finalLoan =
      await getLoanForDisbursement(
        loan._id
      );

    return {
      alreadyCompleted: true,
      loan: finalLoan,
    };
  }

  // -------------------------------------------------------
  // A reversed transfer cannot become successful.
  // -------------------------------------------------------

  if (
    loan.disbursementStatus ===
    "REVERSED"
  ) {
    throw createError(
      "A reversed disbursement cannot be marked successful",
      409
    );
  }

  const disbursement =
    await DisbursementRepository.findByReference(
      normalizedReference
    );

  const now = new Date();

  // -------------------------------------------------------
  // Update local disbursement record.
  //
  // Disbursement status is LOWERCASE.
  // -------------------------------------------------------

  if (disbursement) {
    await DisbursementRepository.updateById(
      disbursement._id,
      {
        status: "successful",

        completedAt: now,

        providerReference:
          providerResult?.reference ||
          providerResult?.transfer_code ||
          disbursement.providerReference ||
          normalizedReference,

        providerTransferCode:
          providerResult?.transfer_code ||
          disbursement.providerTransferCode ||
          null,

        providerTransferId:
          providerResult?.id ||
          disbursement.providerTransferId ||
          null,

        providerData:
          providerResult,

        failureReason: null,
      }
    );
  }

  // -------------------------------------------------------
  // Finalize Loan.
  //
  // Loan disbursementStatus is UPPERCASE.
  // -------------------------------------------------------

  const updatedLoan =
    await Loan.findOneAndUpdate(
      {
        _id: loan._id,
        disbursementStatus: {
          $ne: "SUCCESS",
        },
      },
      {
        $set: {
          status: "active",

          disbursementStatus:
            "SUCCESS",

          amountDisbursed:
            Number(
              loan.principalAmount
            ),

          disbursedAt: now,

          startDate: now,

          disbursementReference:
            normalizedReference,

          ...(adminId
            ? {
                disbursedBy:
                  adminId,
              }
            : {}),

          paystackTransferCode:
            providerResult?.transfer_code ||
            loan.paystackTransferCode ||
            null,

          paystackTransferId:
            providerResult?.id ||
            loan.paystackTransferId ||
            null,

          disbursementReason: null,
        },
      },
      {
        returnDocument: "after",
      }
    );

  const finalLoan =
    updatedLoan ||
    (await Loan.findById(
      loan._id
    ));

  if (!finalLoan) {
    throw createError(
      "Loan could not be finalized after successful disbursement",
      500
    );
  }

  // -------------------------------------------------------
  // Update loan application.
  // -------------------------------------------------------

  if (finalLoan.loanApplication) {
    await LoanApplication.findByIdAndUpdate(
      finalLoan.loanApplication,
      {
        $set: {
          status: "disbursed",
        },
      }
    );
  }

  // -------------------------------------------------------
  // Create repayment schedule.
  // -------------------------------------------------------

  if (disbursement) {
    await ensureRepaymentSchedule(
      disbursement._id,
      finalLoan._id
    );
  }

  // -------------------------------------------------------
  // Refetch with populated repayment schedule.
  // -------------------------------------------------------

  const finalLoanWithSchedule =
    await getLoanForDisbursement(
      finalLoan._id
    );

  return {
    alreadyCompleted: false,
    loan: finalLoanWithSchedule,
  };
};

// =========================================================
// FAILED DISBURSEMENT
// =========================================================

/**
 * Mark Paystack transfer as failed.
 */
const markDisbursementFailed = async ({
  reference,
  reason = "Paystack transfer failed",
  providerResult = null,
}) => {
  const normalizedReference =
    String(reference || "").trim();

  if (!normalizedReference) {
    throw createError(
      "Disbursement reference is required",
      400
    );
  }

  const loan = await Loan.findOne({
    disbursementReference:
      normalizedReference,
  });

  if (!loan) {
    throw createError(
      `Loan not found for disbursement reference ${normalizedReference}`,
      404
    );
  }

  if (
    loan.disbursementStatus ===
    "SUCCESS"
  ) {
    return {
      ignored: true,
      message:
        "Successful disbursement cannot be marked failed",
      loan,
    };
  }

  if (
    loan.disbursementStatus ===
    "REVERSED"
  ) {
    return {
      ignored: true,
      message:
        "Reversed disbursement cannot be marked failed",
      loan,
    };
  }

  if (
    loan.disbursementStatus ===
    "FAILED"
  ) {
    return {
      alreadyFailed: true,
      loan,
    };
  }

  const disbursement =
    await DisbursementRepository.findByReference(
      normalizedReference
    );

  const failureReason =
    String(reason).slice(0, 500);

  if (disbursement) {
    await DisbursementRepository.updateById(
      disbursement._id,
      {
        status: "failed",
        failureReason,
        failedAt: new Date(),
        providerReference:
          providerResult?.reference ||
          providerResult?.transfer_code ||
          disbursement.providerReference ||
          normalizedReference,
        providerTransferCode:
          providerResult?.transfer_code ||
          disbursement.providerTransferCode ||
          null,
        providerTransferId:
          providerResult?.id ||
          disbursement.providerTransferId ||
          null,
        providerData: providerResult,
      }
    );
  }

  const updatedLoan =
    await Loan.findOneAndUpdate(
      {
        _id: loan._id,
        disbursementStatus: {
          $ne: "SUCCESS",
        },
      },
      {
        $set: {
          status: "pending_disbursement",
          disbursementStatus:
            "FAILED",
          disbursementReason:
            failureReason,
        },
        $unset: {
          paystackTransferCode: "",
          paystackTransferId: "",
        },
      },
      {
        returnDocument: "after",
      }
    );

  return {
    alreadyFailed: false,
    loan: updatedLoan || loan,
  };
};

// =========================================================
// REVERSED DISBURSEMENT
// =========================================================

/**
 * Mark Paystack transfer as reversed.
 *
 * Reversal is kept separate from normal failure because
 * the provider may already have sent funds before reversal.
 */
const markDisbursementReversed = async ({
  reference,
  reason = "Paystack transfer was reversed",
  providerResult = null,
}) => {
  const normalizedReference =
    String(reference || "").trim();

  if (!normalizedReference) {
    throw createError(
      "Disbursement reference is required",
      400
    );
  }

  const loan = await Loan.findOne({
    disbursementReference:
      normalizedReference,
  });

  if (!loan) {
    throw createError(
      `Loan not found for disbursement reference ${normalizedReference}`,
      404
    );
  }

  if (
    loan.disbursementStatus ===
    "REVERSED"
  ) {
    return {
      alreadyReversed: true,
      loan,
    };
  }

  const disbursement =
    await DisbursementRepository.findByReference(
      normalizedReference
    );

  const failureReason =
    String(reason).slice(0, 500);

  if (disbursement) {
    await DisbursementRepository.updateById(
      disbursement._id,
      {
        status: "reversed",
        failureReason,
        reversedAt: new Date(),
        providerReference:
          providerResult?.reference ||
          providerResult?.transfer_code ||
          disbursement.providerReference ||
          normalizedReference,
        providerTransferCode:
          providerResult?.transfer_code ||
          disbursement.providerTransferCode ||
          null,
        providerTransferId:
          providerResult?.id ||
          disbursement.providerTransferId ||
          null,
        providerData: providerResult,
      }
    );
  }

  const updatedLoan =
    await Loan.findOneAndUpdate(
      {
        _id: loan._id,
        disbursementStatus: {
          $ne: "REVERSED",
        },
      },
      {
        $set: {
          status: "pending_disbursement",
          disbursementStatus:
            "REVERSED",
          disbursementReason:
            failureReason,
        },
      },
      {
        returnDocument: "after",
      }
    );

  return {
    alreadyReversed: false,
    loan: updatedLoan || loan,
  };
};

// =========================================================
// PAYSTACK DISBURSEMENT
// =========================================================

/**
 * Start Paystack disbursement.
 *
 * Paystack initiation is NOT final success.
 *
 * The loan remains:
 *
 * disbursing / PROCESSING
 *
 * until a successful provider callback/webhook is received.
 */
const startPaystackDisbursement =
  async (loanId) => {
    // -----------------------------------------------------
    // LOAD LOAN
    // -----------------------------------------------------

    const loan =
      await getLoanForDisbursement(
        loanId
      );

    // -----------------------------------------------------
    // VALIDATE LOAN
    // -----------------------------------------------------

    const validation =
      await validateLoanForDisbursement(
        loan
      );

    if (
      validation.alreadyCompleted
    ) {
      return {
        alreadyCompleted: true,
        loan,
      };
    }

    if (
      validation.alreadyProcessing
    ) {
      return {
        alreadyProcessing: true,
        loan,
      };
    }

    // -----------------------------------------------------
    // RESOLVE CUSTOMER
    // -----------------------------------------------------

    const userId =
      getUserId(loan.user);

    if (!userId) {
      throw createError(
        "Loan customer could not be identified",
        400
      );
    }

    // -----------------------------------------------------
    // CURRENT VERIFIED PRIMARY ACCOUNT
    //
    // NEW disbursements ALWAYS use the current verified
    // primary account.
    // -----------------------------------------------------

    const bankAccount =
      await getVerifiedBankAccount(
        userId
      );

    // -----------------------------------------------------
    // ATOMICALLY CLAIM LOAN
    // -----------------------------------------------------

    const claim =
      await claimLoanForPaystack(
        loanId
      );

    if (!claim.loan) {
      const currentLoan =
        await getLoanForDisbursement(
          loanId
        );

      if (
        currentLoan.disbursementStatus ===
          "SUCCESS" ||
        currentLoan.status ===
          "active"
      ) {
        return {
          alreadyCompleted: true,
          loan: currentLoan,
        };
      }

      if (
        currentLoan.disbursementStatus ===
        "PROCESSING"
      ) {
        return {
          alreadyProcessing: true,
          loan: currentLoan,
        };
      }

      throw createError(
        "Loan could not be claimed for Paystack disbursement",
        409
      );
    }

    const claimedLoan =
      claim.loan;

    const reference =
      claim.reference;

    let localDisbursement =
      null;

    let providerTransferInitiated =
      false;

    try {
      // ===================================================
      // CREATE LOCAL DISBURSEMENT RECORD
      // ===================================================

      localDisbursement =
        await createLocalDisbursement({
          loan:
            claimedLoan,

          bankAccount,

          reference,

          provider:
            "paystack",
        });

      // ===================================================
      // CREATE PAYSTACK RECIPIENT
      // ===================================================

      const recipient =
        await createTransferRecipient({
          name:
            bankAccount.accountName ||
            claimedLoan.user?.name ||
            `${claimedLoan.user?.firstName || ""} ${
              claimedLoan.user?.lastName || ""
            }`.trim(),

          accountName:
            bankAccount.accountName ||
            undefined,

          accountNumber:
            bankAccount.accountNumber,

          bankCode:
            bankAccount.bankCode,

          currency:
            "NGN",
        });

      if (
        !recipient?.recipientCode &&
        !recipient?.data?.recipient_code
      ) {
        throw createError(
          "Paystack did not return a transfer recipient",
          502
        );
      }

      const recipientCode =
        recipient.recipientCode ||
        recipient.data?.recipient_code;

      // ===================================================
      // LOAN AMOUNT
      //
      // principalAmount is assumed to be stored in NGN.
      //
      // Paystack expects NGN transfer amounts in KOBO.
      // ===================================================

      const loanAmount =
        Number(
          claimedLoan.principalAmount
        );

      if (
        !Number.isFinite(
          loanAmount
        ) ||
        loanAmount <= 0
      ) {
        throw createError(
          "Invalid loan principal amount",
          400
        );
      }

      const transferAmountKobo =
        Math.round(
          loanAmount * 100
        );

      // ===================================================
      // INITIATE PAYSTACK TRANSFER
      // ===================================================

      const providerResult =
        await initiateTransfer({
          amount:
            transferAmountKobo,

          currency:
            "NGN",

          recipient:
            recipientCode,

          reference,

          reason:
            claimedLoan.disbursementReason ||
            `Loan disbursement ${
              claimedLoan.loanNumber ||
              claimedLoan._id
            }`,
        });

      if (
        !providerResult ||
        !providerResult.reference
      ) {
        throw createError(
          "Paystack did not return a valid transfer reference",
          502
        );
      }

      // ===================================================
      // PAYSTACK ACCEPTED TRANSFER
      //
      // Do NOT mark loan successful here.
      // ===================================================

      providerTransferInitiated =
        true;

      // ===================================================
      // UPDATE LOCAL DISBURSEMENT
      // ===================================================

      if (localDisbursement) {
        await DisbursementRepository.updateById(
          localDisbursement._id,
          {
            status:
              "processing",

            initiatedAt:
              localDisbursement.initiatedAt ||
              new Date(),

            providerReference:
              providerResult.reference,

            providerTransferCode:
              providerResult.transfer_code ||
              null,

            providerTransferId:
              providerResult.id ||
              null,

            providerData: {
              recipient,
              transfer:
                providerResult,
            },

            failureReason:
              null,
          }
        );
      }

      // ===================================================
      // UPDATE LOAN WITH PAYSTACK DETAILS
      // ===================================================

      await Loan.findByIdAndUpdate(
        claimedLoan._id,
        {
          $set: {
            paystackTransferCode:
              providerResult.transfer_code ||
              null,

            paystackTransferId:
              providerResult.id ||
              null,

            disbursementReason:
              null,
          },
        }
      );

      // ===================================================
      // RETURN
      // ===================================================

      return {
        initiated: true,

        waitingForWebhook:
          true,

        reference,

        amount:
          loanAmount,

        amountKobo:
          transferAmountKobo,

        bankAccount: {
          bankName:
            bankAccount.bankName,

          accountName:
            bankAccount.accountName,

          accountNumberLast4:
            bankAccount.accountNumberLast4,
        },

        providerResult,

        loan:
          await getLoanForDisbursement(
            claimedLoan._id
          ),
      };
    } catch (error) {
      // ===================================================
      // PAYSTACK MAY ALREADY HAVE ACCEPTED THE TRANSFER
      // ===================================================

      if (
        providerTransferInitiated
      ) {
        throw error;
      }

      const failureReason =
        String(
          error?.message ||
            "Paystack transfer initiation failed"
        ).slice(0, 500);

      // ===================================================
      // LOCAL DISBURSEMENT FAILED
      // ===================================================

      if (localDisbursement) {
        await DisbursementRepository.updateById(
          localDisbursement._id,
          {
            status:
              "failed",

            failureReason,

            failedAt:
              new Date(),
          }
        );
      }

      // ===================================================
      // RESET LOAN
      // ===================================================

      await Loan.findOneAndUpdate(
        {
          _id:
            claimedLoan._id,

          disbursementStatus:
            "PROCESSING",
        },
        {
          $set: {
            status:
              "pending_disbursement",

            disbursementStatus:
              "FAILED",

            disbursementReason:
              failureReason,
          },

          $unset: {
            paystackTransferCode:
              "",

            paystackTransferId:
              "",
          },
        }
      );

      throw error;
    }
  };

// =========================================================
// CUSTOMER DISBURSEMENT
// =========================================================

/**
 * Customer-triggered Paystack disbursement from
 * an accepted loan offer.
 */
const createDisbursement = async (
  userId,
  offerId
) => {
  const offer =
    await LoanOfferRepository.findByIdInternal(
      offerId
    );

  if (!offer) {
    throw createError(
      "Loan offer not found",
      404
    );
  }

  if (
    String(
      getUserId(offer.user)
    ) !== String(userId)
  ) {
    throw createError(
      "You are not authorized to disburse this loan",
      403
    );
  }

  if (
    offer.status !== "accepted"
  ) {
    throw createError(
      "Loan offer must be accepted before disbursement",
      400
    );
  }

  const loan =
    await Loan.findOne({
      loanOffer: offer._id,
    });

  if (!loan) {
    throw createError(
      "Loan has not been created for this offer",
      404
    );
  }

  return startPaystackDisbursement(
    loan._id
  );
};

// =========================================================
// MANUAL DISBURSEMENT - START
// =========================================================

/**
 * Start manual disbursement.
 *
 * This does NOT mean money has been sent.
 * It only claims the loan and records the manual attempt.
 */
const startManualDisbursement =
  async (
    loanId,
    adminId
  ) => {
    const loan =
      await getLoanForDisbursement(
        loanId
      );

    const validation =
      await validateLoanForDisbursement(
        loan
      );

    if (
      validation.alreadyCompleted
    ) {
      return {
        alreadyCompleted: true,
        loan,
      };
    }

    if (
      validation.alreadyProcessing
    ) {
      return {
        alreadyProcessing: true,
        loan,
      };
    }

    const bankAccount =
      await getVerifiedBankAccount(
        getUserId(loan.user)
      );

    const claim =
      await claimLoanForManual(
        loanId,
        adminId
      );

    if (!claim.loan) {
      const currentLoan =
        await getLoanForDisbursement(
          loanId
        );

      if (
        currentLoan.disbursementStatus ===
          "SUCCESS" ||
        currentLoan.status === "active"
      ) {
        return {
          alreadyCompleted: true,
          loan: currentLoan,
        };
      }

      if (
        currentLoan.disbursementStatus ===
        "PROCESSING"
      ) {
        return {
          alreadyProcessing: true,
          loan: currentLoan,
        };
      }

      throw createError(
        "Loan could not be claimed for manual disbursement",
        409
      );
    }

    const localDisbursement =
      await createLocalDisbursement({
        loan: claim.loan,

        bankAccount,

        reference:
          claim.reference,

        provider: "manual",
      });

    return {
      started: true,

      reference:
        claim.reference,

      loan: claim.loan,

      bankAccount: {
        bankName:
          bankAccount.bankName,

        accountName:
          bankAccount.accountName,

        accountNumberLast4:
          bankAccount.accountNumberLast4,
      },

      disbursement:
        localDisbursement,
    };
  };

// =========================================================
// MANUAL DISBURSEMENT - COMPLETE
// =========================================================

/**
 * Complete a manual disbursement after the admin
 * has actually sent the money.
 *
 * The supplied reference is an audit/reference value
 * for the manual payment.
 */
const completeManualDisbursement =
  async (
    loanId,
    adminId,
    reference
  ) => {
    const finalReference =
      String(reference || "").trim();

    if (!finalReference) {
      throw createError(
        "Manual disbursement reference is required",
        400
      );
    }

    const loan =
      await getLoanForDisbursement(
        loanId
      );

    // -----------------------------------------------------
    // Idempotency.
    // -----------------------------------------------------

    if (
      loan.disbursementStatus ===
        "SUCCESS" &&
      loan.status === "active"
    ) {
      return {
        alreadyCompleted: true,
        loan,
        bankAccount: null,
      };
    }

    // -----------------------------------------------------
    // Must be a manual disbursement.
    // -----------------------------------------------------

    if (
      loan.disbursementMethod !==
      "manual"
    ) {
      throw createError(
        "This loan is not configured for manual disbursement",
        400
      );
    }

    // -----------------------------------------------------
    // Must still be processing.
    // -----------------------------------------------------

    if (
      loan.status !== "disbursing" ||
      loan.disbursementStatus !==
        "PROCESSING"
    ) {
      throw createError(
        "This loan is not currently processing a manual disbursement",
        409
      );
    }

    const bankAccount =
      await getVerifiedBankAccount(
        getUserId(loan.user)
      );

    // -----------------------------------------------------
    // Find the current disbursement attempt.
    // -----------------------------------------------------

    const disbursement =
      await DisbursementRepository.findByReference(
        loan.disbursementReference
      );

    if (!disbursement) {
      throw createError(
        "Manual disbursement record not found",
        404
      );
    }

    // -----------------------------------------------------
    // Protect against completing an already successful
    // local disbursement.
    // -----------------------------------------------------

    if (
      disbursement.status ===
      "successful"
    ) {
      const currentLoan =
        await getLoanForDisbursement(
          loan._id
        );

      if (
        currentLoan.disbursementStatus ===
          "SUCCESS" &&
        currentLoan.status === "active"
      ) {
        return {
          alreadyCompleted: true,
          loan: currentLoan,
          bankAccount,
        };
      }
    }

    const now = new Date();
    const startDate = now;
    const durationDays =
      Number(loan.durationDays || 0);
    const maturityDate =
      new Date(
        startDate.getTime() +
          durationDays *
            24 *
            60 *
            60 *
            1000
      );

    // -----------------------------------------------------
    // Finalize Loan first.
    //
    // This prevents the local disbursement from being
    // marked successful if the Loan state cannot be
    // atomically changed.
    // -----------------------------------------------------

    const finalLoan =
      await Loan.findOneAndUpdate(
        {
          _id: loan._id,
          status: "disbursing",
          disbursementStatus:
            "PROCESSING",
          disbursementMethod:
            "manual",
        },
        {
          $set: {
            status: "active",
            disbursementStatus:
              "SUCCESS",
            amountDisbursed:
              Number(
                loan.principalAmount
              ),
            manualDisbursementReference:
              finalReference,
            disbursedBy: adminId,
            disbursedAt: now,
            startDate,
            maturityDate,
            disbursementReason:
              null,
          },
        },
        {
          returnDocument: "after",
        }
      );

    if (!finalLoan) {
      throw createError(
        "Loan could not be finalized after manual disbursement",
        500
      );
    }

    // -----------------------------------------------------
    // Update local Disbursement.
    //
    // Disbursement status is lowercase.
    // -----------------------------------------------------

    await DisbursementRepository.updateById(
      disbursement._id,
      {
        status: "successful",
        providerReference:
          finalReference,
        providerData: {
          method: "manual",
          reference:
            finalReference,
          completedBy: adminId,
          completedAt: now,
        },
        completedAt: now,
        failureReason: null,
      }
    );

    // -----------------------------------------------------
    // Update LoanApplication.
    // -----------------------------------------------------

    if (finalLoan.loanApplication) {
      await LoanApplication.findByIdAndUpdate(
        finalLoan.loanApplication,
        {
          $set: {
            status: "disbursed",
          },
        }
      );
    }

    // -----------------------------------------------------
    // Create repayment schedule.
    // -----------------------------------------------------

    await ensureRepaymentSchedule(
      disbursement._id,
      finalLoan._id
    );

    // -----------------------------------------------------
    // Return populated loan.
    // -----------------------------------------------------

    const finalLoanWithSchedule =
      await getLoanForDisbursement(
        finalLoan._id
      );

    return {
      alreadyCompleted: false,
      loan: finalLoanWithSchedule,
      bankAccount,
    };
  };

// =========================================================
// ADMIN DISBURSEMENT GETTERS
// =========================================================

const getAdminDisbursement =
  async (
    disbursementId
  ) => {
    return DisbursementRepository.findByIdAdmin(
      disbursementId
    );
  };

const getAdminDisbursements =
  async ({
    status = null,
    page = 1,
    limit = 20,
  } = {}) => {
    return DisbursementRepository.findAll({
      status,
      page,
      limit,
    });
  };

// =========================================================
// RETRY
// =========================================================

/**
 * Retry a failed Paystack disbursement.
 *
 * The failed attempt remains in the database as an
 * audit record. A new Paystack attempt is created.
 */
const retryDisbursement = async (
  disbursementId
) => {
  const disbursement =
    await DisbursementRepository.findByIdAdmin(
      disbursementId
    );

  if (!disbursement) {
    throw createError(
      "Disbursement not found",
      404
    );
  }

  if (
    disbursement.provider !==
    "paystack"
  ) {
    throw createError(
      "Only Paystack disbursements can be retried automatically",
      400
    );
  }

  if (
    disbursement.status !==
    "failed"
  ) {
    throw createError(
      "Only failed disbursements can be retried",
      400
    );
  }

  const loan =
    await Loan.findById(
      disbursement.loan
    );

  if (!loan) {
    throw createError(
      "Loan not found",
      404
    );
  }

  if (
    loan.disbursementStatus ===
      "SUCCESS" ||
    loan.status === "active"
  ) {
    return {
      alreadyCompleted: true,
      loan,
    };
  }

  if (
    loan.disbursementStatus ===
    "PROCESSING"
  ) {
    return {
      alreadyProcessing: true,
      loan,
    };
  }

  if (
    loan.disbursementStatus ===
    "REVERSED"
  ) {
    throw createError(
      "Reversed disbursements require review and cannot be automatically retried",
      400
    );
  }

  // -------------------------------------------------------
  // Mark the loan ready for a completely new attempt.
  // -------------------------------------------------------

  const resetLoan =
    await Loan.findOneAndUpdate(
      {
        _id: loan._id,

        disbursementStatus:
          "FAILED",

        status:
          "pending_disbursement",
      },
      {
        $set: {
          status:
            "pending_disbursement",

          disbursementStatus:
            "PENDING",

          disbursementMethod:
            "paystack",

          disbursementReason:
            null,

          paystackTransferCode:
            null,

          paystackTransferId:
            null,
        },
      },
      {
        returnDocument: "after",
      }
    );

  if (!resetLoan) {
    const currentLoan =
      await Loan.findById(
        loan._id
      );

    if (
      currentLoan?.disbursementStatus ===
      "PROCESSING"
    ) {
      return {
        alreadyProcessing: true,

        loan: currentLoan,
      };
    }

    if (
      currentLoan?.disbursementStatus ===
        "SUCCESS" ||
      currentLoan?.status === "active"
    ) {
      return {
        alreadyCompleted: true,

        loan: currentLoan,
      };
    }

    throw createError(
      "Loan could not be prepared for retry",
      409
    );
  }

  // -------------------------------------------------------
  // Keep the old failed Disbursement record untouched
  // except for audit metadata.
  // -------------------------------------------------------

  await DisbursementRepository.updateById(
    disbursement._id,
    {
      retryRequestedAt:
        new Date(),

      retryCount:
        Number(
          disbursement.retryCount || 0
        ) + 1,
    }
  );

  // -------------------------------------------------------
  // startPaystackDisbursement() creates the NEW attempt.
  // -------------------------------------------------------

  return startPaystackDisbursement(
    loan._id
  );
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  createDisbursement,

  startPaystackDisbursement,

  startManualDisbursement,

  completeManualDisbursement,

  markDisbursementSuccessful,

  markDisbursementFailed,

  markDisbursementReversed,

  getAdminDisbursement,

  getAdminDisbursements,

  retryDisbursement,
};