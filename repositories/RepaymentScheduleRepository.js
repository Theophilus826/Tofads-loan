
const RepaymentSchedule = require(
  "../model/RepaymentScheduleModel"
);

// =========================================================
// CREATE
// =========================================================

const create = async (data) => {
  return RepaymentSchedule.create(data);
};

// =========================================================
// FIND BY ID - CUSTOMER
// =========================================================

const findById = async (
  scheduleId,
  userId
) => {
  return RepaymentSchedule.findOne({
    _id: scheduleId,
    user: userId,
  })
    .populate(
      "loan",
      "loanNumber principalAmount totalRepayment amountPaid outstandingAmount status repaymentFrequency numberOfInstallments installmentAmount startDate maturityDate"
    )
    .populate(
      "loanApplication",
      "applicationNumber amountRequested status"
    )
    .populate(
      "loanOffer",
      "approvedAmount interestRate interestType totalInterest totalFees totalRepayment durationDays repaymentFrequency installmentAmount numberOfInstallments status"
    )
    .populate(
      "disbursement",
      "amount currency method provider reference providerReference status initiatedAt completedAt"
    );
};

// =========================================================
// FIND BY ID - INTERNAL
// =========================================================

const findByIdInternal = async (
  scheduleId
) => {
  return RepaymentSchedule.findById(
    scheduleId
  );
};

// =========================================================
// FIND BY DISBURSEMENT
// =========================================================

const findByDisbursement = async (
  disbursementId
) => {
  return RepaymentSchedule.findOne({
    disbursement: disbursementId,
  });
};

// =========================================================
// FIND BY LOAN
// =========================================================

const findByLoan = async (
  loanId
) => {
  return RepaymentSchedule.findOne({
    loan: loanId,
  });
};

// =========================================================
// FIND BY LOAN - INTERNAL
// =========================================================

const findByLoanInternal = async (
  loanId
) => {
  return RepaymentSchedule.findOne({
    loan: loanId,
  });
};

// =========================================================
// FIND BY LOAN APPLICATION
// =========================================================

const findByLoanApplication = async (
  loanApplicationId,
  userId
) => {
  return RepaymentSchedule.findOne({
    loanApplication: loanApplicationId,
    user: userId,
  })
    .populate(
      "loan",
      "loanNumber principalAmount totalRepayment amountPaid outstandingAmount status"
    )
    .populate(
      "loanApplication",
      "applicationNumber amountRequested status"
    )
    .populate(
      "loanOffer",
      "approvedAmount interestRate interestType totalRepayment status"
    )
    .populate(
      "disbursement",
      "amount currency method provider reference status completedAt"
    );
};

// =========================================================
// FIND ALL FOR USER
// =========================================================

const findByUser = async (
  userId
) => {
  return RepaymentSchedule.find({
    user: userId,
  })
    .populate(
      "loan",
      "loanNumber principalAmount totalRepayment amountPaid outstandingAmount status repaymentFrequency numberOfInstallments installmentAmount startDate maturityDate"
    )
    .populate(
      "loanApplication",
      "applicationNumber amountRequested status"
    )
    .populate(
      "loanOffer",
      "approvedAmount interestRate interestType totalRepayment status"
    )
    .populate(
      "disbursement",
      "amount currency method provider reference status completedAt"
    )
    .sort({
      createdAt: -1,
    });
};

// =========================================================
// FIND ALL - ADMIN
// =========================================================

const findAll = async ({
  status = null,
  page = 1,
  limit = 20,
} = {}) => {
  const query = {};

  if (status) {
    query.status = status;
  }

  const safePage = Math.max(
    1,
    Number(page) || 1
  );

  const safeLimit = Math.min(
    100,
    Math.max(1, Number(limit) || 20)
  );

  const skip =
    (safePage - 1) * safeLimit;

  const [items, total] =
    await Promise.all([
      RepaymentSchedule.find(query)
        .populate(
          "user",
          "firstName lastName name email phone"
        )
        .populate(
          "loan",
          "loanNumber principalAmount totalRepayment amountPaid outstandingAmount status repaymentFrequency"
        )
        .populate(
          "loanApplication",
          "applicationNumber amountRequested status"
        )
        .populate(
          "loanOffer",
          "approvedAmount interestRate totalRepayment status"
        )
        .populate(
          "disbursement",
          "amount currency method provider reference providerReference status initiatedAt completedAt failedAt"
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(safeLimit),

      RepaymentSchedule.countDocuments(
        query
      ),
    ]);

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(
      total / safeLimit
    ),
  };
};

// =========================================================
// UPDATE
// =========================================================

const updateById = async (
  scheduleId,
  update
) => {
  return RepaymentSchedule.findByIdAndUpdate(
    scheduleId,
    {
      $set: update,
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  );
};

// =========================================================
// SAVE DOCUMENT
// =========================================================

const save = async (
  schedule
) => {
  return schedule.save();
};

// =========================================================
// FIND DUE INSTALLMENTS
// =========================================================
//
// Returns schedules containing at least one
// installment that is due and still unpaid.
//
// =========================================================

const findDueInstallments = async (
  date = new Date()
) => {
  return RepaymentSchedule.find({
    status: {
      $in: [
        "active",
        "partially_paid",
        "overdue",
      ],
    },

    amountOutstanding: {
      $gt: 0,
    },

    installments: {
      $elemMatch: {
        dueDate: {
          $lte: date,
        },

        status: {
          $in: [
            "pending",
            "partially_paid",
            "overdue",
          ],
        },

        remainingAmount: {
          $gt: 0,
        },
      },
    },
  })
    .populate(
      "loan",
      "loanNumber principalAmount totalRepayment amountPaid outstandingAmount status repaymentFrequency"
    )
    .populate(
      "loanApplication",
      "applicationNumber amountRequested status"
    )
    .populate(
      "loanOffer",
      "approvedAmount interestRate interestType totalRepayment status"
    )
    .populate(
      "disbursement",
      "amount currency method provider reference providerReference status completedAt"
    )
    .sort({
      "installments.dueDate": 1,
    });
};

// =========================================================
// FIND SCHEDULES FOR AUTO-DEBIT
// =========================================================
//
// Used by the repayment worker.
//
// Only schedules with:
// - collectible status
// - outstanding balance
// - due unpaid installments
//
// are returned.
//
// =========================================================

const findSchedulesForAutoDebit = async (
  date = new Date()
) => {
  return RepaymentSchedule.find({
    status: {
      $in: [
        "active",
        "partially_paid",
        "overdue",
      ],
    },

    amountOutstanding: {
      $gt: 0,
    },

    installments: {
      $elemMatch: {
        dueDate: {
          $lte: date,
        },

        status: {
          $in: [
            "pending",
            "partially_paid",
            "overdue",
          ],
        },

        remainingAmount: {
          $gt: 0,
        },
      },
    },
  })
    .populate(
      "loan",
      "loanNumber principalAmount totalRepayment amountPaid outstandingAmount status repaymentFrequency"
    )
    .populate(
      "loanApplication",
      "applicationNumber amountRequested status"
    )
    .populate(
      "loanOffer",
      "approvedAmount interestRate interestType totalRepayment status"
    )
    .populate(
      "disbursement",
      "amount currency method provider reference providerReference status completedAt"
    )
    .sort({
      "installments.dueDate": 1,
    });
};

// =========================================================
// FIND OVERDUE SCHEDULES
// =========================================================

const findOverdueSchedules = async (
  date = new Date()
) => {
  return RepaymentSchedule.find({
    status: {
      $in: [
        "active",
        "partially_paid",
        "overdue",
      ],
    },

    amountOutstanding: {
      $gt: 0,
    },

    installments: {
      $elemMatch: {
        dueDate: {
          $lt: date,
        },

        status: {
          $in: [
            "pending",
            "partially_paid",
          ],
        },

        remainingAmount: {
          $gt: 0,
        },
      },
    },
  });
};

// =========================================================
// EXPORT
// =========================================================

module.exports = {
  create,

  findById,
  findByIdInternal,

  findByDisbursement,

  findByLoan,
  findByLoanInternal,

  findByLoanApplication,

  findByUser,

  findAll,

  updateById,

  save,

  findDueInstallments,

  findSchedulesForAutoDebit,

  findOverdueSchedules,
};

