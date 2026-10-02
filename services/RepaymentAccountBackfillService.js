const DisbursementRepository = require(
  "../repositories/DisbursementRepository"
);

const RepaymentAccountRepository = require(
  "../repositories/RepaymentAccountRepository"
);

const RepaymentAccountService = require(
  "./RepaymentAccountService"
);

// =========================================================
// PROVISION EXISTING DISBURSED BORROWERS
// =========================================================

const provisionExistingDisbursedBorrowers = async ({
  page = 1,
  limit = 100,
} = {}) => {
  const result =
    await DisbursementRepository.findSuccessfulBorrowers({
      page,
      limit,
    });

  const summary = {
    total: result.total,

    processed: 0,

    provisioned: 0,

    alreadyProvisioned: 0,

    pending: 0,

    failed: 0,

    items: [],
  };

  for (const item of result.items) {
    summary.processed += 1;

    const userId = item._id;

    try {
      // ---------------------------------------------------
      // CHECK EXISTING ACCOUNT
      // ---------------------------------------------------

      const existingAccount =
        await RepaymentAccountRepository.findByUser(
          userId
        );

      // ---------------------------------------------------
      // ALREADY HAS ACTIVE DVA
      // ---------------------------------------------------

      if (
        existingAccount &&
        existingAccount.provider === "paystack" &&
        existingAccount.dvaStatus === "active" &&
        existingAccount.accountNumber &&
        existingAccount.providerAccountId &&
        existingAccount.providerCustomerCode
      ) {
        summary.alreadyProvisioned += 1;

        summary.items.push({
          userId,

          disbursementId:
            item.disbursementId,

          status: "already_provisioned",

          accountId:
            existingAccount._id,

          accountNumber:
            existingAccount.accountNumber,

          dvaStatus:
            existingAccount.dvaStatus,
        });

        continue;
      }

      // ---------------------------------------------------
      // EXISTING PENDING DVA
      // ---------------------------------------------------

      if (
        existingAccount &&
        existingAccount.provider === "paystack" &&
        existingAccount.dvaStatus === "pending" &&
        existingAccount.providerCustomerCode
      ) {
        summary.pending += 1;

        summary.items.push({
          userId,

          disbursementId:
            item.disbursementId,

          status: "pending",

          accountId:
            existingAccount._id,

          accountNumber:
            existingAccount.accountNumber || null,

          dvaStatus:
            existingAccount.dvaStatus,
        });

        continue;
      }

      // ---------------------------------------------------
      // PROVISION
      // ---------------------------------------------------

      const account =
        await RepaymentAccountService
          .getOrCreateAccountWithDva(
            userId
          );

      if (
        account.dvaStatus === "pending"
      ) {
        summary.pending += 1;

        summary.items.push({
          userId,

          disbursementId:
            item.disbursementId,

          status: "pending",

          accountId:
            account._id,

          accountNumber:
            account.accountNumber || null,

          dvaStatus:
            account.dvaStatus,
        });

        continue;
      }

      if (
        account.dvaStatus === "active"
      ) {
        summary.provisioned += 1;

        summary.items.push({
          userId,

          disbursementId:
            item.disbursementId,

          status: "provisioned",

          accountId:
            account._id,

          accountNumber:
            account.accountNumber || null,

          dvaStatus:
            account.dvaStatus,
        });

        continue;
      }

      summary.items.push({
        userId,

        disbursementId:
          item.disbursementId,

        status: "unknown",

        accountId:
          account._id,

        accountNumber:
          account.accountNumber || null,

        dvaStatus:
          account.dvaStatus || null,
      });
    } catch (error) {
      summary.failed += 1;

      summary.items.push({
        userId,

        disbursementId:
          item.disbursementId,

        status: "failed",

        error: error.message,
      });
    }
  }

  return {
    ...summary,

    page: result.page,

    limit: result.limit,

    totalPages: result.totalPages,
  };
};

module.exports = {
  provisionExistingDisbursedBorrowers,
};