const RepaymentRepository =
require("../repositories/RepaymentRepository");

const RepaymentService =
require("./RepaymentService");

// =========================================================
// CREATE ERROR
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
// GET PAYMENT REFERENCE
// =========================================================
//
// Paystack transaction webhooks normally provide:
//
// data.reference
//
// We also support direct/reference variants so the service
// remains tolerant of different webhook payload shapes.
// =========================================================

const getPaymentReference = (payload) => {
return (
payload?.reference ||
payload?.paymentReference ||
payload?.data?.reference ||
null
);
};

// =========================================================
// GET PROVIDER REFERENCE
// =========================================================
//
// Keep the provider reference separately from our internal
// paymentReference where possible.
// =========================================================

const getProviderReference = (payload) => {
return (
payload?.id ||
payload?.transaction_id ||
payload?.data?.id ||
payload?.data?.transaction_id ||
null
);
};

// =========================================================
// GET PROVIDER AMOUNT
// =========================================================
//
// Paystack transaction amounts are normally expressed in
// kobo, while our database stores repayment amounts in NGN.
// =========================================================

const getProviderAmount = (payload) => {
const rawAmount =
payload?.amount ??
payload?.data?.amount;

if (
rawAmount === undefined ||
rawAmount === null
) {
return null;
}

const numericAmount =
Number(rawAmount);

if (!Number.isFinite(numericAmount)) {
return null;
}

return numericAmount / 100;
};

// =========================================================
// GET PROVIDER CURRENCY
// =========================================================

const getProviderCurrency = (payload) => {
return (
payload?.currency ||
payload?.data?.currency ||
null
);
};

// =========================================================
// GET FAILURE MESSAGE
// =========================================================

const getFailureReason = (payload, fallback) => {
return (
payload?.message ||
payload?.data?.message ||
payload?.gateway_response ||
payload?.data?.gateway_response ||
fallback
);
};

// =========================================================
// HANDLE PAYMENT SUCCESS
// =========================================================

const handleRepaymentSuccess = async (payload) => {
const paymentReference =
getPaymentReference(payload);

if (!paymentReference) {
throw createError(
"Missing repayment payment reference",
400
);
}

// =======================================================
// FIND EXISTING REPAYMENT
// =======================================================

const repayment =
await RepaymentRepository.findByPaymentReference(
paymentReference
);

if (!repayment) {
throw createError(
`Repayment not found: ${paymentReference}`,
404
);
}

// =======================================================
// IDEMPOTENCY
// =======================================================

if (repayment.status === "successful") {
return repayment;
}

// =======================================================
// PROTECT FINAL REVERSED STATE
// =======================================================

if (repayment.status === "reversed") {
throw createError(
"A reversed repayment cannot be marked successful",
409
);
}

// =======================================================
// ONLY PENDING/PROCESSING PAYMENTS MAY SUCCEED
// =======================================================

if (
!["pending", "processing"].includes(
repayment.status
)
) {
throw createError(
`Repayment cannot transition from ${repayment.status} to successful`,
409
);
}

// =======================================================
// VERIFY PAYMENT AMOUNT
// =======================================================

const providerAmount =
getProviderAmount(payload);

if (providerAmount !== null) {
const expectedAmount =
Number(repayment.amount);


if (!Number.isFinite(expectedAmount)) {
  throw createError(
    "Invalid repayment amount",
    400
  );
}

const difference =
  Math.abs(
    providerAmount -
      expectedAmount
  );

if (difference > 0.01) {
  throw createError(
    "Payment amount does not match repayment amount",
    400
  );
}


}

// =======================================================
// VERIFY CURRENCY WHEN PROVIDED
// =======================================================

const providerCurrency =
getProviderCurrency(payload);

if (
providerCurrency &&
repayment.currency &&
String(providerCurrency).toUpperCase() !==
String(repayment.currency).toUpperCase()
) {
throw createError(
"Payment currency does not match repayment currency",
400
);
}

// =======================================================
// FINALIZE EXISTING REPAYMENT
// =======================================================
//
// IMPORTANT:
// processSuccessfulRepayment() finalizes the repayment
// already created by initiateRepayment().
//
// It does NOT create another repayment.
//
const result =
await RepaymentService.processSuccessfulRepayment(
repayment._id,
{
...payload,


    provider: "paystack",

    providerReference:
      getProviderReference(payload),
  }
);


return result;
};

// =========================================================
// HANDLE PAYMENT FAILED
// =========================================================

const handleRepaymentFailed = async (payload) => {
const paymentReference =
getPaymentReference(payload);

if (!paymentReference) {
throw createError(
"Missing repayment payment reference",
400
);
}

const repayment =
await RepaymentRepository.findByPaymentReference(
paymentReference
);

if (!repayment) {
throw createError(
`Repayment not found: ${paymentReference}`,
404
);
}

// =======================================================
// SUCCESS IS FINAL
// =======================================================

if (repayment.status === "successful") {
return repayment;
}

// =======================================================
// FAILED IS IDEMPOTENT
// =======================================================

if (repayment.status === "failed") {
return repayment;
}

// =======================================================
// REVERSED IS ALSO FINAL
// =======================================================

if (repayment.status === "reversed") {
return repayment;
}

// =======================================================
// ONLY PENDING/PROCESSING MAY BECOME FAILED
// =======================================================

if (
!["pending", "processing"].includes(
repayment.status
)
) {
return repayment;
}

// =======================================================
// MARK FAILED
// =======================================================

return RepaymentRepository.updateById(
repayment._id,
{
status: "failed",


  failureReason:
    getFailureReason(
      payload,
      "Payment failed"
    ),

  provider: "paystack",

  providerReference:
    getProviderReference(payload),

  providerData:
    payload,

  paidAt: null,
}


);
};

// =========================================================
// HANDLE PAYMENT REVERSED
// =========================================================

const handleRepaymentReversed = async (payload) => {
const paymentReference =
getPaymentReference(payload);

if (!paymentReference) {
throw createError(
"Missing repayment payment reference",
400
);
}

const repayment =
await RepaymentRepository.findByPaymentReference(
paymentReference
);

if (!repayment) {
throw createError(
`Repayment not found: ${paymentReference}`,
404
);
}

// =======================================================
// ALREADY REVERSED
// =======================================================

if (repayment.status === "reversed") {
return repayment;
}

// =======================================================
// SUCCESSFUL PAYMENTS REQUIRE SPECIAL HANDLING
// =======================================================
//
// A reversal after successful settlement is different
// from a normal pre-settlement reversed event.
//
// We do not silently change a successful repayment here
// because the loan/schedule balances have already been
// updated.
//
if (repayment.status === "successful") {
return repayment;
}

// =======================================================
// ONLY PENDING/PROCESSING MAY BECOME REVERSED
// =======================================================

if (
!["pending", "processing"].includes(
repayment.status
)
) {
return repayment;
}

// =======================================================
// MARK REVERSED
// =======================================================

return RepaymentRepository.updateById(
repayment._id,
{
status: "reversed",


  failureReason:
    getFailureReason(
      payload,
      "Payment was reversed"
    ),

  provider: "paystack",

  providerReference:
    getProviderReference(payload),

  providerData:
    payload,
}


);
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
handleRepaymentSuccess,
handleRepaymentFailed,
handleRepaymentReversed,
};
