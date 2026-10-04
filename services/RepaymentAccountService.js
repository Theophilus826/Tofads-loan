const crypto = require("crypto");
const mongoose = require("mongoose");

const User = require("../model/UserModel");

const RepaymentAccountRepository = require("../repositories/RepaymentAccountRepository");
const RepaymentAccountTransactionRepository = require("../repositories/RepaymentAccountTransactionRepository");

const PaymentProvider = require("../config/PaymentProvider");

// =========================================================
// HELPERS
// =========================================================

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const roundMoney = (amount) => {
  return Math.round(Number(amount) * 100) / 100;
};

// =========================================================
// CUSTOMER HELPERS
// =========================================================

const splitCustomerName = (name) => {
  const normalizedName = String(name || "").trim();

  if (!normalizedName) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  const parts = normalizedName.split(/\s+/);

  return {
    firstName: parts.shift() || "",
    lastName: parts.join(" ") || "",
  };
};

const getUserForPaymentProvider = async (userId, session = null) => {
  const query = User.findById(userId).select("name email phone");

  if (session) {
    query.session(session);
  }

  const user = await query;

  if (!user) {
    throw createError("Customer account not found", 404);
  }

  if (!user.email) {
    throw createError(
      "Customer email is required to create a repayment virtual account",
      400,
    );
  }

  return user;
};

const getAssignedDvaFromCustomer = (customerData) => {
  const accounts = [
    customerData?.dedicated_account,
    ...(Array.isArray(customerData?.dedicated_accounts)
      ? customerData.dedicated_accounts
      : []),
  ];

  return (
    accounts.find(
      (dva) =>
        dva?.active === true &&
        dva?.assigned === true &&
        dva?.id &&
        dva?.account_number,
    ) || null
  );
};

const persistAssignedCustomerDva = async (
  account,
  customer,
  user,
  userId,
  session = null,
) => {
  const dva = getAssignedDvaFromCustomer(
    customer.providerData,
  );

  if (!dva) {
    return null;
  }

  const updatedAccount =
    await RepaymentAccountRepository
      .updateDedicatedVirtualAccount(
        account._id,
        {
          provider: "paystack",
          dvaStatus: "active",
          providerCustomerCode:
            customer.customerCode,
          providerAccountId:
            String(dva.id),
          accountNumber:
            dva.account_number,
          accountName:
            dva.account_name || user.name || null,
          bankName:
            dva.bank?.name || null,
          bankCode:
            dva.bank?.code || null,
          currency:
            dva.currency || "NGN",
          metadata: {
            ...(account.metadata || {}),
            purpose: "loan_repayment",
            customerName: user.name || null,
            paystackCustomer:
              customer.providerData,
            dedicatedVirtualAccount: dva,
            existingDvaReconciledAt: new Date(),
          },
        },
        session ? { session } : {},
      );

  if (!updatedAccount) {
    throw createError(
      "Unable to save existing Paystack dedicated virtual account",
      500,
    );
  }

  console.log(
    "✅ EXISTING PAYSTACK DVA RECONCILED:",
    {
      accountId: updatedAccount._id,
      userId,
      providerAccountId: updatedAccount.providerAccountId,
      accountNumber: updatedAccount.accountNumber,
    },
  );

  return updatedAccount;
};

const markCompleteDvaActive = async (
  account,
  session = null,
) => {
  if (
    account.provider !== "paystack" ||
    account.dvaStatus === "active"
  ) {
    return account;
  }

  const updatedAccount =
    await RepaymentAccountRepository.findByIdAndUpdate(
      account._id,
      {
        $set: {
          provider: "paystack",
          dvaStatus: "active",
        },
      },
      session ? { session } : {},
    );

  if (!updatedAccount) {
    throw createError(
      "Unable to activate repayment account with complete DVA details",
      500,
    );
  }

  return updatedAccount;
};

// =========================================================
// ENSURE DEDICATED VIRTUAL ACCOUNT
// =========================================================

const ensureDedicatedVirtualAccount = async (
  account,
  userId,
  session = null,
) => {
  const hasPendingAssignment =
    account.provider === "paystack" &&
    account.dvaStatus === "pending" &&
    Boolean(account.providerCustomerCode);

  // -------------------------------------------------------
  // DVA already fully exists
  // -------------------------------------------------------

  if (
    account.accountNumber &&
    account.providerAccountId &&
    account.providerCustomerCode
  ) {
    return markCompleteDvaActive(
      account,
      session,
    );
  }

  const user = await getUserForPaymentProvider(
    userId,
    session,
  );

  const { firstName, lastName } =
    splitCustomerName(user.name);

  // -------------------------------------------------------
  // CREATE / REUSE PAYSTACK CUSTOMER
  // -------------------------------------------------------

  const customer =
    await PaymentProvider.createOrGetCustomer({
      email: user.email,

      firstName,

      lastName,

      phone:
        user.phone || undefined,

      metadata: {
        purpose: "loan_repayment",

        userId: String(userId),

        customerName:
          user.name || null,
      },
    });

  if (
    !customer ||
    !customer.customerCode
  ) {
    throw createError(
      "Paystack customer could not be created or retrieved",
      502,
    );
  }

  const reconciledAccount =
    await persistAssignedCustomerDva(
      account,
      customer,
      user,
      userId,
      session,
    );

  if (reconciledAccount) {
    return reconciledAccount;
  }

  if (hasPendingAssignment) {
    return account;
  }

  // -------------------------------------------------------
  // DVA EXISTS BUT CUSTOMER CODE WAS MISSING
  // -------------------------------------------------------

  if (
    account.accountNumber &&
    account.providerAccountId
  ) {
    const updatedAccount =
      await RepaymentAccountRepository.findByIdAndUpdate(
        account._id,

        {
          $set: {
            provider: "paystack",

            providerCustomerCode:
              customer.customerCode,
          },
        },

        session
          ? { session }
          : {},
      );

    if (!updatedAccount) {
      throw createError(
        "Unable to update repayment account",
        500,
      );
    }

    return updatedAccount;
  }

  // -------------------------------------------------------
  // CREATE PAYSTACK DVA
  // -------------------------------------------------------

  const dedicatedAccount =
    await PaymentProvider.createDedicatedVirtualAccount({
      customerCode:
        customer.customerCode,

      email:
        user.email,

      phone:
        user.phone || undefined,

      firstName,

      lastName,

      metadata: {
        purpose: "loan_repayment",

        userId:
          String(userId),

        customerName:
          user.name || null,

        repaymentAccountId:
          String(account._id),
      },
    });

  if (!dedicatedAccount) {
    throw createError(
      "Paystack dedicated virtual account assignment failed",
      502,
    );
  }

  // -------------------------------------------------------
  // SAVE DVA
  // -------------------------------------------------------

  const assignmentIsComplete =
    dedicatedAccount.assigned === true &&
    Boolean(
      dedicatedAccount.providerAccountId &&
        dedicatedAccount.accountNumber,
    );

  const updateData = {
    provider: "paystack",

    dvaStatus:
      assignmentIsComplete
        ? "active"
        : dedicatedAccount.dvaStatus ||
          "pending",

    providerCustomerCode:
      customer.customerCode,

    providerAccountId:
      dedicatedAccount.providerAccountId ||
      null,

    accountNumber:
      dedicatedAccount.accountNumber ||
      null,

    accountName:
      dedicatedAccount.accountName ||
      user.name ||
      null,

    bankName:
      dedicatedAccount.bankName ||
      null,

    bankCode:
      dedicatedAccount.bankCode ||
      null,

    currency:
      dedicatedAccount.currency ||
      account.currency ||
      "NGN",

    metadata: {
      ...(account.metadata || {}),

      purpose:
        "loan_repayment",

      customerName:
        user.name || null,

      paystackCustomer:
        customer.providerData ||
        null,

      dedicatedVirtualAccount:
        dedicatedAccount.providerData ||
        null,
    },
  };

  const updatedAccount =
    await RepaymentAccountRepository.findByIdAndUpdate(
      account._id,

      {
        $set: updateData,
      },

      session
        ? { session }
        : {},
    );

  if (!updatedAccount) {
    throw createError(
      "Unable to save repayment virtual account",
      500,
    );
  }

  return updatedAccount;
};

// =========================================================
// GET OR CREATE LOCAL ACCOUNT
// =========================================================

const getOrCreateAccount = async (userId, session = null) => {
  if (!userId) {
    throw createError("User ID is required", 400);
  }

  let account = await RepaymentAccountRepository.findByUserInternal(
    userId,
    session,
  );

  if (account) {
    if (account.status !== "active") {
      throw createError(`Repayment account is ${account.status}`, 400);
    }

    return account;
  }

  account = await RepaymentAccountRepository.create(
    {
      user: userId,

      currency: "NGN",

      balance: 0,

      totalCredited: 0,

      totalRepaid: 0,

      status: "active",

      provider: "paystack",
    },
    session ? { session } : {},
  );

  return account;
};

// =========================================================
// GET OR CREATE ACCOUNT + DVA
// =========================================================

// =========================================================
// GET OR CREATE ACCOUNT + DVA
// =========================================================

const getOrCreateAccountWithDva = async (userId, session = null) => {
  if (!userId) {
    throw createError("User ID is required", 400);
  }

  let account = await getOrCreateAccount(userId, session);

  // -------------------------------------------------------
  // Already fully provisioned
  // -------------------------------------------------------

  const hasCompleteDva =
    account.provider === "paystack" &&
    account.accountNumber &&
    account.providerAccountId &&
    account.providerCustomerCode;

  if (hasCompleteDva) {
    return markCompleteDvaActive(
      account,
      session,
    );
  }

  // -------------------------------------------------------
  // DVA assignment already accepted by Paystack and waiting
  // for the success webhook.
  //
  // IMPORTANT:
  // Do NOT call Paystack again while pending.
  // -------------------------------------------------------

  if (
    account.provider === "paystack" &&
    account.dvaStatus === "pending" &&
    account.providerCustomerCode
  ) {
    return ensureDedicatedVirtualAccount(
      account,
      userId,
      session,
    );
  }

  // -------------------------------------------------------
  // Failed/incomplete DVA can be retried
  // -------------------------------------------------------

  return ensureDedicatedVirtualAccount(
    account,
    userId,
    session,
  );
};

// =========================================================
// GET REPAYMENT ACCOUNT
// =========================================================

const getAccount = async (userId) => {
  if (!userId) {
    throw createError("User ID is required", 400);
  }

  const account =
    await RepaymentAccountRepository.findByUserInternal(
      userId,
    );

  if (!account) {
    throw createError("Repayment account not found", 404);
  }

  return account;
};

// =========================================================
// GET BALANCE
// =========================================================

/**
 * READ ONLY.
 *
 * Does not:
 * - create repayment account
 * - create Paystack customer
 * - create DVA
 */
const getBalance = async (userId) => {
  const account = await getAccount(userId);

  return {
    accountId: account._id,

    balance: account.balance,

    currency: account.currency,

    totalCredited: account.totalCredited,

    totalRepaid: account.totalRepaid,

    status: account.status,

    accountNumber: account.accountNumber || null,

    accountName: account.accountName || null,

    bankName: account.bankName || null,

    provider: account.provider || null,

    providerCustomerCode: account.providerCustomerCode || null,

    providerAccountId: account.providerAccountId || null,
  };
};

// =========================================================
// PROVISION REPAYMENT ACCOUNT + DVA
// =========================================================

const provisionRepaymentAccount = async (userId) => {
  if (!userId) {
    throw createError("User ID is required", 400);
  }

  const account =
    await getOrCreateAccountWithDva(userId);

  return {
    accountId: account._id,

    balance: account.balance,

    currency: account.currency,

    totalCredited: account.totalCredited,

    totalRepaid: account.totalRepaid,

    status: account.status,

    dvaStatus: account.dvaStatus,

    accountNumber:
      account.accountNumber || null,

    accountName:
      account.accountName || null,

    bankName:
      account.bankName || null,

    bankCode:
      account.bankCode || null,

    provider:
      account.provider || null,

    providerCustomerCode:
      account.providerCustomerCode || null,

    providerAccountId:
      account.providerAccountId || null,
  };
};

// =========================================================
// COMPLETE FUNDING
// =========================================================

const completeFunding = async ({ providerReference, providerData }) => {
  if (!providerReference || !String(providerReference).trim()) {
    throw createError("Funding provider reference is required", 400);
  }

  const normalizedReference = String(providerReference).trim();

  const session = await mongoose.startSession();

  let result = null;

  try {
    await session.withTransaction(async () => {
      const transaction =
        await RepaymentAccountTransactionRepository.findByProviderReference(
          normalizedReference,
          session,
        );

      if (!transaction) {
        throw createError("Funding transaction not found", 404);
      }

      if (
        transaction.purpose !== "account_funding" ||
        transaction.type !== "credit"
      ) {
        throw createError(
          "Provider reference does not belong to an account funding transaction",
          400,
        );
      }

      if (transaction.status === "successful") {
        result = transaction;
        return;
      }

      if (transaction.status !== "pending") {
        throw createError(
          `Funding transaction cannot be completed from ${transaction.status} state`,
          409,
        );
      }

      const account = await RepaymentAccountRepository.findByIdInternal(
        transaction.repaymentAccount,
        session,
      );

      if (!account) {
        throw createError("Repayment account not found", 404);
      }

      if (account.status !== "active") {
        throw createError("Repayment account is not active", 400);
      }

      if (String(account.user) !== String(transaction.user)) {
        throw createError(
          "Funding transaction does not belong to repayment account owner",
          403,
        );
      }

      const amount = roundMoney(transaction.amount);

      const balanceBefore = roundMoney(account.balance);

      const balanceAfter = roundMoney(balanceBefore + amount);

      const updatedAccount = await RepaymentAccountRepository.credit(
        account._id,
        amount,
        {
          session,
        },
      );

      if (!updatedAccount) {
        throw createError("Unable to credit repayment account", 409);
      }

      const updatedTransaction =
        await RepaymentAccountTransactionRepository.markFundingSuccessful(
          transaction._id,
          {
            balanceBefore,

            balanceAfter,

            providerReference: normalizedReference,

            providerData: providerData || transaction.providerData,

            processedAt: new Date(),
          },
          {
            session,
          },
        );

      if (!updatedTransaction) {
        throw createError("Funding transaction was already processed", 409);
      }

      result = updatedTransaction;
    });

    return result;
  } finally {
    await session.endSession();
  }
};

// =========================================================
// FAIL FUNDING
// =========================================================

const failFunding = async ({
  providerReference,
  providerData,
  failureReason,
}) => {
  if (!providerReference || !String(providerReference).trim()) {
    throw createError("Funding provider reference is required", 400);
  }

  const normalizedReference = String(providerReference).trim();

  const transaction =
    await RepaymentAccountTransactionRepository.findByProviderReference(
      normalizedReference,
    );

  if (!transaction) {
    return null;
  }

  if (
    transaction.purpose !== "account_funding" ||
    transaction.type !== "credit"
  ) {
    return null;
  }

  if (transaction.status === "successful") {
    return transaction;
  }

  if (transaction.status === "failed") {
    return transaction;
  }

  if (transaction.status !== "pending") {
    throw createError(
      `Funding transaction cannot be failed from ${transaction.status} state`,
      409,
    );
  }

  return RepaymentAccountTransactionRepository.markFundingFailed(
    transaction._id,
    failureReason || "Payment provider reported a failed transaction",
    {
      providerReference: normalizedReference,

      providerData: providerData || transaction.providerData,
    },
  );
};

// =========================================================
// REVERSE FUNDING
// =========================================================

const reverseFunding = async ({
  providerReference,
  providerData,
  reversalReason,
}) => {
  if (!providerReference || !String(providerReference).trim()) {
    throw createError("Funding provider reference is required", 400);
  }

  const normalizedReference = String(providerReference).trim();

  const session = await mongoose.startSession();

  let result = null;

  try {
    await session.withTransaction(async () => {
      const originalTransaction =
        await RepaymentAccountTransactionRepository.findByProviderReference(
          normalizedReference,
          session,
        );

      if (!originalTransaction) {
        throw createError("Original funding transaction not found", 404);
      }

      if (
        originalTransaction.purpose !== "account_funding" ||
        originalTransaction.type !== "credit"
      ) {
        throw createError(
          "Provider reference does not belong to account funding",
          400,
        );
      }

      if (originalTransaction.status === "reversed") {
        result = originalTransaction;

        return;
      }

      if (originalTransaction.status !== "successful") {
        throw createError(
          `Only successful funding can be reversed. Current status: ${originalTransaction.status}`,
          409,
        );
      }

      const account = await RepaymentAccountRepository.findByIdInternal(
        originalTransaction.repaymentAccount,
        session,
      );

      if (!account) {
        throw createError("Repayment account not found", 404);
      }

      const amount = roundMoney(originalTransaction.amount);

      const balanceBefore = roundMoney(account.balance);

      if (balanceBefore < amount) {
        throw createError(
          "Insufficient repayment account balance for reversal",
          409,
        );
      }

      const balanceAfter = roundMoney(balanceBefore - amount);

      const updatedAccount = await RepaymentAccountRepository.debit(
        account._id,
        account.user,
        amount,
        {
          session,
        },
      );

      if (!updatedAccount) {
        throw createError("Unable to reverse repayment account funding", 409);
      }

      const updatedOriginal =
        await RepaymentAccountTransactionRepository.markReversed(
          originalTransaction._id,
          reversalReason || "Provider funding reversal",
          {
            providerData: providerData || originalTransaction.providerData,

            balanceBefore,

            balanceAfter,
          },
          {
            session,
          },
        );

      if (!updatedOriginal) {
        throw createError("Funding transaction was already reversed", 409);
      }

      const reversalTransaction =
        await RepaymentAccountTransactionRepository.create(
          {
            repaymentAccount: account._id,

            user: account.user,

            type: "reversal",

            status: "successful",

            amount,

            currency: account.currency || originalTransaction.currency || "NGN",

            balanceBefore,

            balanceAfter,

            purpose: "repayment_reversal",

            loan: null,

            loanApplication: null,

            repaymentSchedule: null,

            repayment: null,

            provider: originalTransaction.provider,

            providerReference: `${normalizedReference}-REVERSAL`,

            providerData: providerData || originalTransaction.providerData,

            description: "Repayment account funding reversal",

            initiatedBy: null,

            initiatedByRole: "system",

            processedAt: new Date(),

            reversalReason: reversalReason || "Provider funding reversal",
          },
          {
            session,
          },
        );

      result = {
        originalTransaction: updatedOriginal,

        reversalTransaction,
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
};

// =========================================================
// GET TRANSACTIONS
// =========================================================

const getTransactions = async (
  userId,
  { page = 1, limit = 20, type, status, purpose } = {},
) => {
  const account = await RepaymentAccountRepository.findByUser(userId);

  if (!account) {
    return {
      items: [],

      total: 0,

      page: Math.max(Number(page) || 1, 1),

      limit: Math.min(Math.max(Number(limit) || 20, 1), 100),

      totalPages: 0,
    };
  }

  return RepaymentAccountTransactionRepository.findByAccount(account._id, {
    page,
    limit,
    type,
    status,
    purpose,
  });
};

// =========================================================
// GET SINGLE TRANSACTION
// =========================================================

const getTransaction = async (userId, transactionId) => {
  const transaction =
    await RepaymentAccountTransactionRepository.findByIdForUser(
      transactionId,
      userId,
    );

  if (!transaction) {
    throw createError("Repayment account transaction not found", 404);
  }

  return transaction;
};

// =========================================================
// CREDIT DEDICATED VIRTUAL ACCOUNT
// =========================================================

const creditDedicatedVirtualAccount = async ({
  accountNumber,
  amount,
  providerReference,
  providerData = null,
}) => {
  const normalizedAccountNumber = String(accountNumber || "")
    .replace(/\s/g, "")
    .trim();

  if (!normalizedAccountNumber) {
    throw createError(
      "Dedicated virtual account number is required",
      400,
    );
  }

  const numericAmount = Number(amount);

  if (
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0
  ) {
    throw createError(
      "Credit amount must be greater than zero",
      400,
    );
  }

  const creditAmount = roundMoney(numericAmount);

  if (creditAmount <= 0) {
    throw createError(
      "Credit amount must be greater than zero",
      400,
    );
  }

  const normalizedReference =
    String(providerReference || "").trim();

  if (!normalizedReference) {
    throw createError(
      "Provider reference is required",
      400,
    );
  }

  const session = await mongoose.startSession();

  let result = null;

  try {
    await session.withTransaction(async () => {
      // ---------------------------------------------------
      // FIND ACTIVE PAYSTACK DVA
      // ---------------------------------------------------

      const account =
        await RepaymentAccountRepository
          .findActiveByAccountNumber(
            normalizedAccountNumber,
            session,
          );

      if (!account) {
        throw createError(
          "Active Paystack repayment account not found for this virtual account number",
          404,
        );
      }

      if (account.provider !== "paystack") {
        throw createError(
          "Virtual account is not managed by Paystack",
          400,
        );
      }

      // ---------------------------------------------------
      // IDEMPOTENCY CHECK
      // ---------------------------------------------------

      const existingTransaction =
        await RepaymentAccountTransactionRepository
          .findByProviderReference(
            normalizedReference,
            "paystack",
            session,
          );

      if (existingTransaction) {
        if (
          String(existingTransaction.repaymentAccount) !==
          String(account._id)
        ) {
          throw createError(
            "Provider reference is already associated with another repayment account",
            409,
          );
        }

        if (
          existingTransaction.type !== "credit" ||
          existingTransaction.purpose !== "account_funding"
        ) {
          throw createError(
            "Provider reference is already associated with another transaction",
            409,
          );
        }

        result = {
          alreadyProcessed: true,

          accountId: account._id,

          transactionId:
            existingTransaction._id,

          amount:
            existingTransaction.amount,

          balance: account.balance,
        };

        return;
      }

      // ---------------------------------------------------
      // BALANCE
      // ---------------------------------------------------

      const balanceBefore =
        roundMoney(account.balance);

      const balanceAfter =
        roundMoney(
          balanceBefore + creditAmount,
        );

      // ---------------------------------------------------
      // CREDIT ACCOUNT
      // ---------------------------------------------------

      const updatedAccount =
        await RepaymentAccountRepository.credit(
          account._id,
          creditAmount,
          {
            session,
          },
        );

      if (!updatedAccount) {
        throw createError(
          "Unable to credit repayment account",
          409,
        );
      }

      // ---------------------------------------------------
      // RECORD TRANSACTION
      // ---------------------------------------------------

      try {
        const transaction =
          await RepaymentAccountTransactionRepository.create(
            {
              repaymentAccount: account._id,

              user: account.user,

              type: "credit",

              status: "successful",

              purpose: "account_funding",

              amount: creditAmount,

              currency:
                account.currency || "NGN",

              balanceBefore,

              balanceAfter,

              provider: "paystack",

              providerReference:
                normalizedReference,

              providerData,

              processedAt: new Date(),
            },
            {
              session,
            },
          );

        result = {
          alreadyProcessed: false,

          accountId:
            updatedAccount._id,

          transactionId:
            transaction._id,

          amount: creditAmount,

          balance:
            updatedAccount.balance,
        };
      } catch (error) {
        // Mongo duplicate-key protection.
        //
        // The transaction will roll back, so the
        // account credit above will also be rolled back.

        if (error?.code === 11000) {
          throw createError(
            "Provider transaction has already been processed",
            409,
          );
        }

        throw error;
      }
    });

    return result;
  } finally {
    await session.endSession();
  }
};

const retryDedicatedVirtualAccount = async (userId) => {
  if (!userId) {
    throw new Error("User ID is required");
  }

  let account =
    await RepaymentAccountRepository.findByUserInternal(
      userId,
    );

  if (!account) {
    account =
      await getOrCreateAccountWithDva(userId);
  }

  account = await ensureDedicatedVirtualAccount(
    account,
    userId,
  );

  const isActive =
    account.dvaStatus === "active" &&
    account.accountNumber &&
    account.providerAccountId;

  return {
    success: true,
    status: isActive ? "active" : "pending",
    message: isActive
      ? "Dedicated virtual account is active"
      : "Dedicated virtual account assignment is processing. Waiting for Paystack assignment webhook.",
    account: {
      accountId: account._id,
      accountNumber: account.accountNumber || null,
      accountName: account.accountName || null,
      bankName: account.bankName || null,
      bankCode: account.bankCode || null,
      currency: account.currency || "NGN",
      provider: account.provider,
      providerCustomerCode:
        account.providerCustomerCode,
      providerAccountId:
        account.providerAccountId || null,
      dvaStatus: account.dvaStatus,
    },
  };
};
// =========================================================
// EXPORT
// =========================================================

module.exports = {
  getOrCreateAccount,

  getOrCreateAccountWithDva,

  provisionRepaymentAccount,

  getAccount,

  getBalance,

  completeFunding,

  failFunding,

  reverseFunding,

  getTransactions,

  getTransaction,

  creditDedicatedVirtualAccount,
  retryDedicatedVirtualAccount,
};
