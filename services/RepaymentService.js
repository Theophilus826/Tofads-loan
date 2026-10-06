const crypto = require("crypto");
const mongoose = require("mongoose");

const RepaymentScheduleRepository =
require("../repositories/RepaymentScheduleRepository");

const RepaymentRepository =
require("../repositories/RepaymentRepository");

const LoanRepository =
require("../repositories/LoanRepository");

const RepaymentAccountRepository =
  require("../repositories/RepaymentAccountRepository");

const RepaymentAccountTransactionRepository =
  require("../repositories/RepaymentAccountTransactionRepository");

const PaymentProvider =
require("../config/PaymentProvider");

// =========================================================
// ROUND MONEY
// =========================================================

const roundMoney = (amount) => {
return (
Math.round(
(Number(amount) + Number.EPSILON) * 100
) / 100
);
};

// =========================================================
// ERROR HELPER
// =========================================================

const createError = (
message,
statusCode = 400
) => {
const error = new Error(message);
error.statusCode = statusCode;
return error;
};

// =========================================================
// PAYMENT REFERENCE
// =========================================================

const generatePaymentReference = () => {
return `REP-${Date.now()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
};

// =========================================================
// PAYMENT METHODS
// =========================================================

const allowedPaymentMethods = [
"bank_transfer",
"card",
"direct_debit",
"wallet",
"cash",
"other",
];

const validatePaymentMethod = (
paymentMethod
) => {
if (
!allowedPaymentMethods.includes(
paymentMethod
)
) {
throw createError(
"Invalid payment method",
400
);
}
};

// =========================================================
// GET CUSTOMER SCHEDULE
// =========================================================

const getCustomerSchedule = async (
repaymentScheduleId,
userId
) => {
if (!repaymentScheduleId) {
throw createError(
"Repayment schedule ID is required",
400
);
}

const schedule =
await RepaymentScheduleRepository.findById(
repaymentScheduleId,
userId
);

if (!schedule) {
throw createError(
"Repayment schedule not found",
404
);
}

return schedule;
};

// =========================================================
// VALIDATE SCHEDULE
// =========================================================

const validateScheduleForPayment = (
schedule
) => {
if (
["paid", "cancelled"].includes(
schedule.status
)
) {
throw createError(
"This repayment schedule is already settled or cancelled",
400
);
}

const outstanding = roundMoney(
schedule.amountOutstanding
);

if (
!Number.isFinite(outstanding) ||
outstanding <= 0
) {
throw createError(
"There is no outstanding balance",
400
);
}

return outstanding;
};

// =========================================================
// GET LOAN
// =========================================================

const getLoanForSchedule = async (
schedule,
session = null
) => {
const loanId =
schedule.loan?._id ||
schedule.loan;

if (!loanId) {
throw createError(
"Loan is missing from repayment schedule",
400
);
}

const loan =
await LoanRepository.findByIdInternal(
loanId,
session
);

if (!loan) {
throw createError(
"Loan not found",
404
);
}

return loan;
};

// =========================================================
// VALIDATE LOAN
// =========================================================

const validateLoanForPayment = (
loan
) => {
if (
loan.status === "cancelled"
) {
throw createError(
"This loan has been cancelled",
400
);
}

if (
loan.status === "completed"
) {
throw createError(
"This loan has already been fully repaid",
400
);
}

const outstanding =
roundMoney(
loan.outstandingAmount
);

if (
!Number.isFinite(outstanding) ||
outstanding <= 0
) {
throw createError(
"This loan has no outstanding balance",
400
);
}
};

// =========================================================
// ALLOCATE PAYMENT
// =========================================================

const allocatePayment = (
schedule,
paymentAmount
) => {
let remainingPayment =
roundMoney(paymentAmount);

let allocatedAmount = 0;

const allocation = [];

const installments =
[...schedule.installments].sort(
(a, b) =>
new Date(a.dueDate).getTime() -
new Date(b.dueDate).getTime()
);

for (
const installment of installments
) {
if (
remainingPayment <= 0
) {
break;
}


if (
  ["paid", "waived"].includes(
    installment.status
  )
) {
  continue;
}

const installmentRemaining =
  roundMoney(
    installment.remainingAmount
  );

if (
  installmentRemaining <= 0
) {
  continue;
}

const allocated =
  roundMoney(
    Math.min(
      remainingPayment,
      installmentRemaining
    )
  );

installment.paidAmount =
  roundMoney(
    Number(
      installment.paidAmount || 0
    ) + allocated
  );

installment.remainingAmount =
  roundMoney(
    Math.max(
      0,
      installmentRemaining -
        allocated
    )
  );

if (
  installment.remainingAmount <=
  0
) {
  installment.remainingAmount = 0;

  installment.status =
    "paid";

  installment.paidAt =
    new Date();

  installment.overdueAt =
    null;
} else {
  installment.status =
    "partially_paid";
}

allocation.push({
  installmentId:
    installment._id,

  installmentNumber:
    installment.installmentNumber,

  amount: allocated,
});

remainingPayment =
  roundMoney(
    remainingPayment -
      allocated
  );

allocatedAmount =
  roundMoney(
    allocatedAmount +
      allocated
  );


}

return {
allocatedAmount,
unallocatedAmount:
remainingPayment,
allocation,
};
};

// =========================================================
// UPDATE SCHEDULE BALANCE
// =========================================================

const updateScheduleBalance = (
schedule,
allocatedAmount
) => {
schedule.amountPaid =
roundMoney(
Number(
schedule.amountPaid || 0
) + allocatedAmount
);

schedule.amountOutstanding =
roundMoney(
Math.max(
0,
Number(
schedule.totalRepaymentAmount
) -
schedule.amountPaid
)
);

if (
schedule.amountOutstanding <=
0
) {
schedule.amountOutstanding = 0;
schedule.status = "paid";
return;
}

const hasOverdue =
schedule.installments.some(
(item) =>
item.status === "overdue"
);

const hasPartial =
schedule.installments.some(
(item) =>
item.status ===
"partially_paid"
);

if (hasOverdue) {
schedule.status = "overdue";
} else if (hasPartial) {
schedule.status =
"partially_paid";
} else {
schedule.status = "active";
}
};

// =========================================================
// UPDATE LOAN BALANCE
// =========================================================

const updateLoanBalance = (
loan,
allocatedAmount
) => {
loan.amountPaid =
roundMoney(
Number(
loan.amountPaid || 0
) + allocatedAmount
);

loan.outstandingAmount =
roundMoney(
Math.max(
0,
Number(
loan.totalRepayment
) -
loan.amountPaid
)
);

if (
loan.outstandingAmount <=
0
) {
loan.outstandingAmount = 0;
loan.status = "completed";
return;
}

if (
loan.status === "overdue"
) {
loan.status = "overdue";
} else {
loan.status = "active";
}
};

// =========================================================
// APPLY SUCCESSFUL REPAYMENT
// =========================================================
//
// MUST run inside a MongoDB transaction.
//
// Repayment + schedule + loan are settled together.
//
// =========================================================

const applySuccessfulRepayment = async ({
repayment,
schedule,
loan,
providerData = null,
provider = null,
providerReference = null,
session,
}) => {
if (!session) {
throw createError(
"A database transaction is required to settle a repayment",
500
);
}

// -------------------------------------------------------
// IDEMPOTENCY
// -------------------------------------------------------

if (
repayment.status === "successful"
) {
return repayment;
}

if (
!["pending", "processing"].includes(
repayment.status
)
) {
throw createError(
`Repayment cannot be completed from status: ${repayment.status}`,
400
);
}

// -------------------------------------------------------
// VALIDATE AMOUNT
// -------------------------------------------------------

const paymentAmount =
roundMoney(repayment.amount);

if (
!Number.isFinite(paymentAmount) ||
paymentAmount <= 0
) {
throw createError(
"Invalid repayment amount",
400
);
}

const outstanding =
validateScheduleForPayment(
schedule
);

if (
paymentAmount > outstanding
) {
throw createError(
"Repayment amount exceeds outstanding balance",
400
);
}

validateLoanForPayment(loan);

// -------------------------------------------------------
// ALLOCATE PAYMENT
// -------------------------------------------------------

const result =
allocatePayment(
schedule,
paymentAmount
);

if (
result.allocatedAmount <= 0
) {
throw createError(
"Unable to allocate repayment",
400
);
}

// -------------------------------------------------------
// UPDATE SCHEDULE
// -------------------------------------------------------

updateScheduleBalance(
schedule,
result.allocatedAmount
);

// -------------------------------------------------------
// UPDATE LOAN
// -------------------------------------------------------

updateLoanBalance(
loan,
result.allocatedAmount
);

// -------------------------------------------------------
// SAVE LOAN
// -------------------------------------------------------

await loan.save({
session,
});

// -------------------------------------------------------
// SAVE SCHEDULE
// -------------------------------------------------------

await RepaymentScheduleRepository.save(
schedule,
session
);

// -------------------------------------------------------
// COMPLETE REPAYMENT
// -------------------------------------------------------

const updated =
await RepaymentRepository.updateById(
repayment._id,
{
status: "successful",


    provider:
      provider ||
      repayment.provider ||
      null,

    providerReference:
      providerReference ||
      repayment.providerReference ||
      null,

    providerData:
      providerData ||
      repayment.providerData ||
      null,

    allocatedAmount:
      result.allocatedAmount,

    unallocatedAmount:
      result.unallocatedAmount,

    allocation:
      result.allocation,

    paidAt: new Date(),
  },
  {
    session,
  }
);


return {
repayment: updated,
schedule,
loan,


allocation:
  result.allocation,

allocatedAmount:
  result.allocatedAmount,

unallocatedAmount:
  result.unallocatedAmount,


};
};

// =========================================================
// MAKE REPAYMENT
// =========================================================
//
// Trusted/internal payment completion.
//
// Do NOT expose this directly to ordinary customers.
//
// =========================================================

const makeRepayment = async (
userId,
{
repaymentScheduleId,
amount,
paymentMethod,
provider,
providerReference,
providerData,
}
) => {
const repaymentAmount =
roundMoney(amount);

if (
!Number.isFinite(
repaymentAmount
) ||
repaymentAmount <= 0
) {
throw createError(
"Repayment amount must be greater than zero",
400
);
}

validatePaymentMethod(
paymentMethod
);

const schedule =
await getCustomerSchedule(
repaymentScheduleId,
userId
);

const outstanding =
validateScheduleForPayment(
schedule
);

if (
repaymentAmount > outstanding
) {
throw createError(
`Repayment cannot exceed the outstanding balance of ${outstanding}`,
400
);
}

const loan =
await getLoanForSchedule(
schedule
);

validateLoanForPayment(
loan
);

// -------------------------------------------------------
// PROVIDER IDEMPOTENCY
// -------------------------------------------------------

if (providerReference) {
const existing =
await RepaymentRepository
.findByProviderReference(
providerReference
);


if (existing) {
  return existing;
}


}

const loanApplicationId =
schedule.loanApplication?._id ||
schedule.loanApplication;

if (!loanApplicationId) {
throw createError(
"Loan application is missing from repayment schedule",
400
);
}

// -------------------------------------------------------
// TRANSACTION
// -------------------------------------------------------

const session =
await mongoose.startSession();

try {
let result;


await session.withTransaction(
  async () => {
    const repayment =
      await RepaymentRepository.create(
        {
  user: userId,

  loan: loan._id,

  loanApplication:
    loanApplicationId,

  repaymentSchedule:
    schedule._id,

  paymentReference:
    generatePaymentReference(),

  amount:
    repaymentAmount,

  currency:
    schedule.currency ||
    "NGN",

  paymentMethod,

  repaymentSource:
    "customer_payment",

  repaymentAccount:
    null,

  mandate:
    null,

  initiatedBy:
    userId,

  initiatedByRole:
    "customer",

  provider:
    provider || null,

  providerReference:
    providerReference || null,

  status:
    "processing",

  providerData:
    providerData || null,

  allocatedAmount: 0,

  unallocatedAmount: 0,

  allocation: [],
},
        {
          session,
        }
      );

    const internalSchedule =
      await RepaymentScheduleRepository
        .findByIdInternal(
          repayment.repaymentSchedule,
          session
        );

    if (!internalSchedule) {
      throw createError(
        "Repayment schedule not found",
        404
      );
    }

    const internalLoan =
      await getLoanForSchedule(
        internalSchedule,
        session
      );

    result =
      await applySuccessfulRepayment({
        repayment,

        schedule:
          internalSchedule,

        loan:
          internalLoan,

        providerData,

        provider,

        providerReference,

        session,
      });
  }
);

return result;


} finally {
await session.endSession();
}
};

// =========================================================
// INITIATE REPAYMENT
// =========================================================
//
// Creates a pending repayment first.
//
// Provider confirmation is required before settlement.
//
// =========================================================

const initiateRepayment = async (
  userId,
  {
    repaymentScheduleId,
    amount,
    paymentMethod,
    email,
  }
) => {
  // =======================================================
  // VALIDATE AMOUNT
  // =======================================================

  const paymentAmount = roundMoney(amount);

  if (
    !Number.isFinite(paymentAmount) ||
    paymentAmount <= 0
  ) {
    throw createError(
      "Invalid repayment amount",
      400
    );
  }

  // =======================================================
  // VALIDATE PAYMENT METHOD
  // =======================================================

  validatePaymentMethod(paymentMethod);

  // =======================================================
  // GET CUSTOMER SCHEDULE
  // =======================================================

  const schedule = await getCustomerSchedule(
    repaymentScheduleId,
    userId
  );

  const outstanding =
    validateScheduleForPayment(schedule);

  if (paymentAmount > outstanding) {
    throw createError(
      `Payment cannot exceed the outstanding balance of ${outstanding}`,
      400
    );
  }

  // =======================================================
  // GET LOAN
  // =======================================================

  const loan = await getLoanForSchedule(
    schedule
  );

  validateLoanForPayment(loan);

  // =======================================================
  // LOAN APPLICATION
  // =======================================================

  const loanApplicationId =
    schedule.loanApplication?._id ||
    schedule.loanApplication;

  if (!loanApplicationId) {
    throw createError(
      "Loan application is missing from repayment schedule",
      400
    );
  }

  // =======================================================
  // PAYMENT REFERENCE
  // =======================================================

  const paymentReference =
    generatePaymentReference();

  // =======================================================
  // CREATE PENDING REPAYMENT
  // =======================================================
  //
  // This is a CUSTOMER payment.
  //
  // It is NOT:
  // - repayment account
  // - mandate debit
  //
  // The repayment remains pending until the
  // verified payment-provider webhook confirms it.
  // =======================================================

  const repayment =
    await RepaymentRepository.create({
      user: userId,

      loan: loan._id,

      loanApplication:
        loanApplicationId,

      repaymentSchedule:
        schedule._id,

      paymentReference,

      amount:
        paymentAmount,

      currency:
        schedule.currency ||
        "NGN",

      paymentMethod,

      // ---------------------------------------------------
      // REPAYMENT SOURCE
      // ---------------------------------------------------

      repaymentSource:
        "customer_payment",

      // ---------------------------------------------------
      // NOT A REPAYMENT ACCOUNT PAYMENT
      // ---------------------------------------------------

      repaymentAccount:
        null,

      // ---------------------------------------------------
      // NOT A MANDATE PAYMENT
      // ---------------------------------------------------

      mandate:
        null,

      // ---------------------------------------------------
      // INITIATOR
      // ---------------------------------------------------

      initiatedBy:
        userId,

      initiatedByRole:
        "customer",

      // ---------------------------------------------------
      // PROVIDER
      // ---------------------------------------------------

      provider:
        null,

      providerReference:
        null,

      providerData:
        null,

      // ---------------------------------------------------
      // PAYMENT STATUS
      // ---------------------------------------------------

      status:
        "pending",

      failureReason:
        null,

      // ---------------------------------------------------
      // ALLOCATION
      // ---------------------------------------------------

      allocatedAmount:
        0,

      unallocatedAmount:
        0,

      allocation: [],
    });

  // =======================================================
  // INITIALIZE PAYMENT PROVIDER
  // =======================================================

  try {
    const providerResponse =
      await PaymentProvider.initializePayment({
        reference:
          paymentReference,

        amount:
          paymentAmount,

        currency:
          schedule.currency ||
          "NGN",

        email,

        metadata: {
          repaymentId:
            repayment._id.toString(),

          repaymentScheduleId:
            schedule._id.toString(),

          loanApplicationId:
            loanApplicationId.toString(),

          loanId:
            loan._id.toString(),

          userId:
            userId.toString(),

          repaymentSource:
            "customer_payment",
        },
      });

    // =====================================================
    // VALIDATE PROVIDER RESPONSE
    // =====================================================

    if (
      !providerResponse ||
      !providerResponse.reference
    ) {
      throw createError(
        "Payment provider returned an invalid response",
        502
      );
    }

    // =====================================================
    // UPDATE REPAYMENT
    // =====================================================

    const updated =
      await RepaymentRepository.updateById(
        repayment._id,
        {
          status:
            "processing",

          provider:
            providerResponse.provider ||
            null,

          providerReference:
            providerResponse.reference,

          providerData:
            providerResponse,
        }
      );

    // =====================================================
    // RESPONSE
    // =====================================================

    return {
      repayment: updated,

      payment: {
        reference:
          paymentReference,

        authorizationUrl:
          providerResponse.authorizationUrl ||
          null,

        accessCode:
          providerResponse.accessCode ||
          null,
      },
    };
  } catch (error) {
    // =====================================================
    // MARK PAYMENT AS FAILED
    // =====================================================

    await RepaymentRepository.updateById(
      repayment._id,
      {
        status:
          "failed",

        failureReason:
          error.message ||
          "Payment initialization failed",
      }
    );

    throw error;
  }
};

// =========================================================
// PROCESS SUCCESSFUL REPAYMENT
// =========================================================
//
// Called only after a verified provider webhook.
//
// Settles the EXISTING repayment.
//
// =========================================================

const processSuccessfulRepayment =
async (
repaymentId,
payload = {}
) => {
const session =
await mongoose.startSession();


try {
  let result;

  await session.withTransaction(
    async () => {
      const repayment =
        await RepaymentRepository
          .findByIdInternal(
            repaymentId,
            session
          );

      if (!repayment) {
        throw createError(
          "Repayment not found",
          404
        );
      }

      // -------------------------------------------------
      // IDEMPOTENCY
      // -------------------------------------------------

      if (
        repayment.status ===
        "successful"
      ) {
        result = repayment;
        return;
      }

      if (
        ![
          "pending",
          "processing",
        ].includes(
          repayment.status
        )
      ) {
        throw createError(
          `Repayment cannot be completed from status: ${repayment.status}`,
          400
        );
      }

      // -------------------------------------------------
      // GET EXACT SCHEDULE
      // -------------------------------------------------
      //
      // Use repayment.repaymentSchedule directly.
      // Do not find the schedule only by loan ID.
      //
      const schedule =
        await RepaymentScheduleRepository
          .findByIdInternal(
            repayment.repaymentSchedule,
            session
          );

      if (!schedule) {
        throw createError(
          "Repayment schedule not found",
          404
        );
      }

      // -------------------------------------------------
      // CHECK SCHEDULE OWNERSHIP
      // -------------------------------------------------

      if (
        String(schedule.user) !==
        String(repayment.user)
      ) {
        throw createError(
          "Repayment does not belong to this schedule",
          409
        );
      }

      // -------------------------------------------------
      // CHECK LOAN REFERENCE
      // -------------------------------------------------

      const scheduleLoanId =
        schedule.loan?._id ||
        schedule.loan;

      if (
        !scheduleLoanId
      ) {
        throw createError(
          "Loan is missing from repayment schedule",
          400
        );
      }

      if (
        repayment.loan &&
        String(
          repayment.loan
        ) !==
          String(
            scheduleLoanId
          )
      ) {
        throw createError(
          "Repayment loan does not match repayment schedule",
          409
        );
      }

      // -------------------------------------------------
      // CHECK APPLICATION REFERENCE
      // -------------------------------------------------

      const scheduleApplicationId =
        schedule.loanApplication?._id ||
        schedule.loanApplication;

      if (
        scheduleApplicationId &&
        repayment.loanApplication &&
        String(
          repayment.loanApplication
        ) !==
          String(
            scheduleApplicationId
          )
      ) {
        throw createError(
          "Repayment application does not match repayment schedule",
          409
        );
      }

      // -------------------------------------------------
      // GET LOAN
      // -------------------------------------------------

      const loan =
        await getLoanForSchedule(
          schedule,
          session
        );

      // -------------------------------------------------
      // VALIDATE LOAN
      // -------------------------------------------------

      validateLoanForPayment(
        loan
      );

      // -------------------------------------------------
      // PROVIDER DATA
      // -------------------------------------------------

      const provider =
        payload?.provider ||
        payload?.data?.provider ||
        repayment.provider ||
        "paystack";

      const providerReference =
        payload?.providerReference ||
        payload?.data?.id ||
        payload?.id ||
        repayment.providerReference ||
        null;

      // -------------------------------------------------
      // APPLY
      // -------------------------------------------------

      result =
        await applySuccessfulRepayment({
          repayment,

          schedule,

          loan,

          providerData:
            payload,

          provider,

          providerReference,

          session,
        });
    }
  );

  return result;
} finally {
  await session.endSession();
}


};

// =========================================================
// PROCESS AUTO-DEBIT REPAYMENT
// =========================================================

const processAutoDebitRepayment = async ({
  debit,
  payload = {},
}) => {
  // =======================================================
  // VALIDATE DEBIT
  // =======================================================

  if (!debit) {
    throw createError(
      "Debit is required",
      400
    );
  }

  if (!debit.repaymentSchedule) {
    throw createError(
      "Repayment schedule is required",
      400
    );
  }

  if (!debit.user) {
    throw createError(
      "Debit user is required",
      400
    );
  }

  if (!debit.mandate) {
    throw createError(
      "Mandate is required for auto-debit repayment",
      400
    );
  }

  // =======================================================
  // VALIDATE AMOUNT
  // =======================================================

  const paymentAmount = roundMoney(
    Number(debit.amount)
  );

  if (
    !Number.isFinite(paymentAmount) ||
    paymentAmount <= 0
  ) {
    throw createError(
      "Invalid auto-debit amount",
      400
    );
  }

  // =======================================================
  // GET CUSTOMER SCHEDULE
  // =======================================================

  const schedule =
    await RepaymentScheduleRepository.findById(
      debit.repaymentSchedule,
      debit.user
    );

  if (!schedule) {
    throw createError(
      "Repayment schedule not found",
      404
    );
  }

  const outstanding =
    validateScheduleForPayment(
      schedule
    );

  if (paymentAmount > outstanding) {
    throw createError(
      `Auto-debit amount cannot exceed the outstanding balance of ${outstanding}`,
      400
    );
  }

  // =======================================================
  // GET LOAN
  // =======================================================

  const loan =
    await getLoanForSchedule(
      schedule
    );

  validateLoanForPayment(loan);

  // =======================================================
  // LOAN APPLICATION
  // =======================================================

  const loanApplicationId =
    schedule.loanApplication?._id ||
    schedule.loanApplication;

  if (!loanApplicationId) {
    throw createError(
      "Loan application is missing from repayment schedule",
      400
    );
  }

  // =======================================================
  // PROVIDER REFERENCE
  // =======================================================

  const providerReference =
    debit.providerReference ||
    debit.reference ||
    null;

  // =======================================================
  // PROVIDER IDEMPOTENCY
  // =======================================================

  if (providerReference) {
    const existing =
      await RepaymentRepository.findByProviderReference(
        providerReference
      );

    if (existing) {
      return existing;
    }
  }

  // =======================================================
  // TRANSACTION
  // =======================================================

  const session =
    await mongoose.startSession();

  try {
    let result;
    let repaymentId;

    await session.withTransaction(
      async () => {
        // =================================================
        // GET MANDATE INSIDE TRANSACTION
        // =================================================

        const Mandate =
          mongoose.model("Mandate");

        const mandate =
          await Mandate.findById(
            debit.mandate
          ).session(session);

        if (!mandate) {
          throw createError(
            "Mandate not found",
            404
          );
        }

        // =================================================
        // VALIDATE MANDATE OWNER
        // =================================================

        if (
          String(mandate.user) !==
          String(debit.user)
        ) {
          throw createError(
            "Mandate does not belong to this customer",
            403
          );
        }

        // =================================================
        // VALIDATE MANDATE STATUS
        // =================================================

        if (
          mandate.status !==
          "active"
        ) {
          throw createError(
            "Mandate is not active",
            400
          );
        }

        // =================================================
        // VALIDATE AUTHORIZATION
        // =================================================

        if (
          !mandate.authorizationCode
        ) {
          throw createError(
            "Mandate does not have a reusable authorization",
            400
          );
        }

        // =================================================
        // VALIDATE MANDATE LOAN
        // =================================================

        if (
          mandate.loan &&
          String(mandate.loan) !==
            String(loan._id)
        ) {
          throw createError(
            "Mandate does not belong to this loan",
            409
          );
        }

        // =================================================
        // VALIDATE MANDATE LOAN APPLICATION
        // =================================================

        if (
          mandate.loanApplication &&
          String(
            mandate.loanApplication
          ) !==
            String(loanApplicationId)
        ) {
          throw createError(
            "Mandate does not belong to this loan application",
            409
          );
        }

        // =================================================
        // CHECK MANDATE EXPIRATION
        // =================================================

        const now = new Date();

        if (
          mandate.endDate &&
          new Date(mandate.endDate) < now
        ) {
          throw createError(
            "Mandate has expired",
            400
          );
        }

        // =================================================
        // CREATE REPAYMENT
        // =================================================

        const repayment =
          await RepaymentRepository.create(
            {
              user:
                debit.user,

              loan:
                loan._id,

              loanApplication:
                loanApplicationId,

              repaymentSchedule:
                schedule._id,

              paymentReference:
                generatePaymentReference(),

              amount:
                paymentAmount,

              currency:
                schedule.currency ||
                "NGN",

              paymentMethod:
                "direct_debit",

              // -------------------------------------------
              // REPAYMENT SOURCE
              // -------------------------------------------

              repaymentSource:
                "mandate",

              // -------------------------------------------
              // REPAYMENT ACCOUNT
              // -------------------------------------------

              repaymentAccount:
                null,

              // -------------------------------------------
              // MANDATE
              // -------------------------------------------

              mandate:
                mandate._id,

              // -------------------------------------------
              // INITIATOR
              // -------------------------------------------

              initiatedBy:
                debit.initiatedBy ||
                null,

              initiatedByRole:
                debit.initiatedByRole ||
                "system",

              // -------------------------------------------
              // PROVIDER
              // -------------------------------------------

              provider:
                debit.provider ||
                "paystack",

              providerReference,

              providerData:
                payload || null,

              // -------------------------------------------
              // STATUS
              // -------------------------------------------

              status:
                "processing",

              failureReason:
                null,

              // -------------------------------------------
              // ALLOCATION
              // -------------------------------------------

              allocatedAmount:
                0,

              unallocatedAmount:
                0,

              allocation: [],
            },
            {
              session,
            }
          );

        repaymentId =
          repayment._id;

        // =================================================
        // RELOAD EXACT SCHEDULE
        // =================================================

        const internalSchedule =
          await RepaymentScheduleRepository.findByIdInternal(
            repayment.repaymentSchedule,
            session
          );

        if (!internalSchedule) {
          throw createError(
            "Repayment schedule not found",
            404
          );
        }

        // =================================================
        // VERIFY SCHEDULE OWNER
        // =================================================

        if (
          String(
            internalSchedule.user
          ) !==
          String(debit.user)
        ) {
          throw createError(
            "Repayment schedule does not belong to customer",
            403
          );
        }

        // =================================================
        // GET INTERNAL LOAN
        // =================================================

        const internalLoan =
          await getLoanForSchedule(
            internalSchedule,
            session
          );

        // =================================================
        // VERIFY LOAN
        // =================================================

        if (
          String(internalLoan._id) !==
          String(loan._id)
        ) {
          throw createError(
            "Repayment loan does not match repayment schedule",
            409
          );
        }

        validateLoanForPayment(
          internalLoan
        );

        // =================================================
        // APPLY REPAYMENT
        // =================================================
        //
        // This performs:
        //
        // - installment allocation
        // - schedule balance update
        // - loan balance update
        // - repayment completion
        //
        // =================================================

        result =
          await applySuccessfulRepayment({
            repayment,

            schedule:
              internalSchedule,

            loan:
              internalLoan,

            providerData:
              payload,

            provider:
              debit.provider ||
              "paystack",

            providerReference,

            session,
          });
      }
    );

    // =====================================================
    // LINK DEBIT RECORD
    // =====================================================

    if (
      debit._id &&
      typeof debit.save ===
        "function"
    ) {
      debit.repayment =
        repaymentId;

      debit.status =
        "successful";

      await debit.save();
    }

    return result;
  } finally {
    await session.endSession();
  }
};

// =========================================================
// REPAY FROM REPAYMENT ACCOUNT
// =========================================================
//
// Customer uses money that has already been credited
// to their reusable repayment account.
//
// NO PAYSTACK WEBHOOK IS REQUIRED.
//
// Account debit + repayment + ledger + schedule + loan
// update happen in one MongoDB transaction.
// =========================================================


const repayFromAccount = async (
  userId,
  {
    repaymentScheduleId,
    amount,
    provider = "internal",
    providerReference = null,
    providerData = null,
    initiatedByRole = "customer",
  }
) => {
  const repaymentAmount = roundMoney(amount);

  // -------------------------------------------------------
  // VALIDATE AMOUNT
  // -------------------------------------------------------

  if (
    !Number.isFinite(repaymentAmount) ||
    repaymentAmount <= 0
  ) {
    throw createError(
      "Repayment amount must be greater than zero",
      400
    );
  }

  // -------------------------------------------------------
  // PROVIDER IDEMPOTENCY
  // -------------------------------------------------------

  if (providerReference) {
    const existingRepayment =
      await RepaymentRepository
        .findByPaymentOrProviderReference(
          providerReference
        );

    if (existingRepayment) {
      console.log(
        "ℹ️ REPAYMENT ALREADY EXISTS FOR PROVIDER REFERENCE:",
        {
          providerReference,
          repaymentId:
            existingRepayment._id,
          status:
            existingRepayment.status,
        }
      );

      return {
        repayment:
          existingRepayment,

        alreadyProcessed:
          existingRepayment.status ===
          "successful",

        duplicate: true,

        repaymentSource:
          "repayment_account",
      };
    }
  }

  // -------------------------------------------------------
  // GET CUSTOMER SCHEDULE
  // -------------------------------------------------------

  const schedule =
    await getCustomerSchedule(
      repaymentScheduleId,
      userId
    );

  const outstanding =
    validateScheduleForPayment(
      schedule
    );

  if (
    repaymentAmount > outstanding
  ) {
    throw createError(
      `Repayment cannot exceed the outstanding balance of ${outstanding}`,
      400
    );
  }

  // -------------------------------------------------------
  // GET LOAN
  // -------------------------------------------------------

  const loan =
    await getLoanForSchedule(
      schedule
    );

  validateLoanForPayment(loan);

  // -------------------------------------------------------
  // LOAN APPLICATION
  // -------------------------------------------------------

  const loanApplicationId =
    schedule.loanApplication?._id ||
    schedule.loanApplication;

  if (!loanApplicationId) {
    throw createError(
      "Loan application is missing from repayment schedule",
      400
    );
  }

  // -------------------------------------------------------
  // TRANSACTION
  // -------------------------------------------------------

  const session =
    await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(
      async () => {
        // -------------------------------------------------
        // GET ACTIVE REPAYMENT ACCOUNT
        // -------------------------------------------------

        const account =
          await RepaymentAccountRepository
            .findActiveByUser(
              userId,
              session
            );

        if (!account) {
          throw createError(
            "Active repayment account not found",
            404
          );
        }

        // -------------------------------------------------
        // ATOMIC ACCOUNT DEBIT
        // -------------------------------------------------

        const balanceBefore =
          roundMoney(
            account.balance
          );

        const updatedAccount =
          await RepaymentAccountRepository.debit(
            account._id,
            userId,
            repaymentAmount,
            {
              session,
            }
          );

        if (!updatedAccount) {
          throw createError(
            "Insufficient repayment account balance",
            400
          );
        }

        // -------------------------------------------------
        // CREATE REPAYMENT
        // -------------------------------------------------

        const repayment =
          await RepaymentRepository.create(
            {
              user: userId,

              loan: loan._id,

              loanApplication:
                loanApplicationId,

              repaymentSchedule:
                schedule._id,

              paymentReference:
                generatePaymentReference(),

              amount:
                repaymentAmount,

              currency:
                account.currency ||
                schedule.currency ||
                "NGN",

              paymentMethod:
                "wallet",

              repaymentSource:
                "repayment_account",

              repaymentAccount:
                account._id,

              mandate: null,

              initiatedBy:
                userId,

              initiatedByRole:
                initiatedByRole ||
                "customer",

              provider:
                provider ||
                "internal",

              providerReference:
                providerReference ||
                null,

              status:
                "processing",

              providerData:
                providerData ||
                null,

              allocatedAmount:
                0,

              unallocatedAmount:
                0,

              allocation: [],
            },
            {
              session,
            }
          );

        // -------------------------------------------------
        // CREATE ACCOUNT LEDGER
        // -------------------------------------------------

        await RepaymentAccountTransactionRepository
          .create(
            {
              repaymentAccount:
                account._id,

              user: userId,

              type: "debit",

              amount:
                repaymentAmount,

              currency:
                account.currency ||
                schedule.currency ||
                "NGN",

              balanceBefore,

              balanceAfter:
                roundMoney(
                  updatedAccount.balance
                ),

              purpose:
                "loan_repayment",

              loan:
                loan._id,

              loanApplication:
                loanApplicationId,

              repaymentSchedule:
                schedule._id,

              repayment:
                repayment._id,

              provider:
                provider ||
                "internal",

              providerReference:
                providerReference ||
                repayment.paymentReference,

              providerData:
                providerData ||
                null,

              description:
                `Loan repayment from repayment account - ${repayment.paymentReference}`,

              initiatedBy:
                userId,

              initiatedByRole:
                initiatedByRole ||
                "customer",
            },
            {
              session,
            }
          );

        // -------------------------------------------------
        // RELOAD EXACT RECORDS INSIDE TRANSACTION
        // -------------------------------------------------

        const internalSchedule =
          await RepaymentScheduleRepository
            .findByIdInternal(
              repayment.repaymentSchedule,
              session
            );

        if (!internalSchedule) {
          throw createError(
            "Repayment schedule not found",
            404
          );
        }

        const internalLoan =
          await getLoanForSchedule(
            internalSchedule,
            session
          );

        // -------------------------------------------------
        // APPLY REPAYMENT
        // -------------------------------------------------

        result =
          await applySuccessfulRepayment({
            repayment,

            schedule:
              internalSchedule,

            loan:
              internalLoan,

            providerData: {
              source:
                "repayment_account",

              repaymentAccount:
                account._id.toString(),

              paymentReference:
                repayment.paymentReference,

              providerData:
                providerData ||
                null,
            },

            provider:
              provider ||
              "internal",

            providerReference:
              providerReference ||
              repayment.paymentReference,

            session,
          });
      }
    );

    return {
      ...result,

      repaymentSource:
        "repayment_account",
    };
  } finally {
    await session.endSession();
  }
};



// =========================================================
// EXPORT
// =========================================================

module.exports = {
initiateRepayment,
makeRepayment,
repayFromAccount,
processSuccessfulRepayment,
processAutoDebitRepayment,
};
