const AdminLoanRepository = require("../repositories/AdminLoanRepository");

const DisbursementService = require("./DisbursementService");

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const VALID_STATUSES = [
  "pending_disbursement",
  "disbursing",
  "active",
  "completed",
  "overdue",
  "defaulted",
  "cancelled",
];

const AdminLoanService = {
  async getAllLoans({
    status,
    search,
    page,
    limit,
  }) {
    if (
      status &&
      !VALID_STATUSES.includes(status)
    ) {
      throw createError(
        `Invalid loan status: ${status}`,
        400
      );
    }

    return AdminLoanRepository.findAllLoans({
      status,
      search,
      page,
      limit,
    });
  },

  async getLoanById(loanId) {
    const loan =
      await AdminLoanRepository.findLoanById(
        loanId
      );

    if (!loan) {
      throw createError("Loan not found", 404);
    }

    return loan;
  },

  async getLoanStats() {
    return AdminLoanRepository.getLoanStats();
  },

  /**
   * Start Paystack disbursement.
   *
   * Delegates all Paystack logic to the existing
   * DisbursementService.
   */
  async initiatePaystackDisbursement(loanId) {
    return DisbursementService.startPaystackDisbursement(
      loanId
    );
  },

  /**
   * Start a manual disbursement.
   *
   * This does NOT mark the loan as successfully
   * disbursed. It only puts the loan into PROCESSING.
   */
  async startManualDisbursement(
    loanId,
    adminUserId
  ) {
    if (!adminUserId) {
      throw createError(
        "Authenticated admin is required",
        401
      );
    }

    return DisbursementService.startManualDisbursement(
      loanId,
      adminUserId
    );
  },

  /**
   * Complete a manual disbursement after the
   * administrator has actually sent the money.
   */
  async completeManualDisbursement(
    loanId,
    adminUserId,
    reference
  ) {
    if (!adminUserId) {
      throw createError(
        "Authenticated admin is required",
        401
      );
    }

    if (
      !reference ||
      String(reference).trim() === ""
    ) {
      throw createError(
        "Manual disbursement reference is required",
        400
      );
    }

    return DisbursementService.completeManualDisbursement(
      loanId,
      adminUserId,
      reference
    );
  },

  async cancelLoan(
    loanId,
    reason,
    adminUserId
  ) {
    if (!adminUserId) {
      throw createError(
        "Authenticated admin is required",
        401
      );
    }

    const loan =
      await AdminLoanRepository.findLoanByIdRaw(
        loanId
      );

    if (!loan) {
      throw createError("Loan not found", 404);
    }

    if (loan.status === "cancelled") {
      throw createError(
        "Loan is already cancelled",
        400
      );
    }

    if (
      ["active", "completed"].includes(
        loan.status
      )
    ) {
      throw createError(
        "An active or completed loan cannot be cancelled",
        400
      );
    }

    if (
      loan.disbursementStatus === "SUCCESS"
    ) {
      throw createError(
        "A successfully disbursed loan cannot be cancelled",
        400
      );
    }

    const update = {
      status: "cancelled",
    };

    if (reason && reason.trim()) {
      update.disbursementReason =
        reason.trim();
    }

    return AdminLoanRepository.updateLoan(
      loanId,
      update
    );
  },

  /**
   * Get the loan and its latest disbursement.
   */
  async getLoanDisbursementInfo(loanId) {
    const loan =
      await AdminLoanRepository.findLoanById(
        loanId
      );

    if (!loan) {
      throw createError("Loan not found", 404);
    }

    const disbursement =
      await AdminLoanRepository.findLatestDisbursementByLoan(
        loanId
      );

    return {
      loan,
      disbursement,
    };
  },
};

module.exports = AdminLoanService;