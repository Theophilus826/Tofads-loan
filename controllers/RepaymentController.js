const RepaymentScheduleRepository = require(
"../repositories/RepaymentScheduleRepository"
);

const RepaymentRepository = require(
"../repositories/RepaymentRepository"
);

const RepaymentService = require(
"../services/RepaymentService"
);


// =========================================================
// GET REPAYMENT SCHEDULE
// =========================================================

const getRepaymentSchedule = async (
  req,
  res,
  next,
) => {
  try {
    const { repaymentScheduleId } = req.params;

    if (!repaymentScheduleId) {
      return res.status(400).json({
        success: false,
        message: "Repayment schedule ID is required",
      });
    }

    const schedule =
      await RepaymentScheduleRepository.findById(
        repaymentScheduleId,
        req.user._id,
      );

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Repayment schedule not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: schedule,
    });
  } catch (error) {
    return next(error);
  }
};



// =========================================================
// INITIATE REPAYMENT
// =========================================================
//
// Customer starts a payment.
//
// This DOES NOT mark the repayment successful.
//
// The payment provider webhook completes it after
// the provider confirms the payment.
//
// =========================================================

const initiateRepayment = async (
req,
res,
next
) => {
try {
const {
repaymentScheduleId,
amount,
paymentMethod,
} = req.body;


if (!repaymentScheduleId) {
  return res.status(400).json({
    success: false,
    message:
      "Repayment schedule ID is required",
  });
}

if (
  amount === undefined ||
  amount === null ||
  !Number.isFinite(
    Number(amount)
  ) ||
  Number(amount) <= 0
) {
  return res.status(400).json({
    success: false,
    message:
      "A valid repayment amount is required",
  });
}

if (!paymentMethod) {
  return res.status(400).json({
    success: false,
    message:
      "Payment method is required",
  });
}

const result =
  await RepaymentService.initiateRepayment(
    req.user._id,
    {
      repaymentScheduleId,

      amount:
        Number(amount),

      paymentMethod,

      email:
        req.user.email,
    }
  );

return res.status(201).json({
  success: true,

  message:
    "Repayment initialized",

  data: result,
});


} catch (error) {
return next(error);
}
};

// =========================================================
// REPAYMENT HISTORY
// =========================================================

const getRepaymentHistory = async (
req,
res,
next
) => {
try {
const repayments =
await RepaymentRepository.findByUser(
req.user._id
);


return res.status(200).json({
  success: true,

  count:
    repayments.length,

  data:
    repayments,
});


} catch (error) {
return next(error);
}
};

// =========================================================
// GET SINGLE REPAYMENT
// =========================================================

const getRepayment = async (
req,
res,
next
) => {
try {
const { id } =
req.params;


if (!id) {
  return res.status(400).json({
    success: false,
    message:
      "Repayment ID is required",
  });
}

const repayment =
  await RepaymentRepository.findById(
    id,
    req.user._id
  );

if (!repayment) {
  return res.status(404).json({
    success: false,
    message:
      "Repayment not found",
  });
}

return res.status(200).json({
  success: true,
  data:
    repayment,
});


} catch (error) {
return next(error);
}
};

// =========================================================
// MAKE REPAYMENT
// =========================================================
//
// Direct completion handler for trusted internal calls.
// This is separate from initiateRepayment because a payment
// provider may complete the payment asynchronously.
// =========================================================

const makeRepayment = async (
  req,
  res,
  next
) => {
  try {
    const {
      repaymentScheduleId,
      amount,
      paymentMethod,
      provider,
      providerReference,
      providerData,
    } = req.body || {};

    if (!repaymentScheduleId) {
      return res.status(400).json({
        success: false,
        message: "Repayment schedule ID is required",
      });
    }

    if (
      amount === undefined ||
      amount === null ||
      !Number.isFinite(Number(amount)) ||
      Number(amount) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid repayment amount is required",
      });
    }

    if (!paymentMethod) {
      return res.status(400).json({
        success: false,
        message: "Payment method is required",
      });
    }

    const result = await RepaymentService.makeRepayment(
      req.user._id,
      {
        repaymentScheduleId,
        amount: Number(amount),
        paymentMethod,
        provider,
        providerReference,
        providerData,
      },
    );

    return res.status(200).json({
      success: true,
      message: "Repayment completed successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

// =========================================================
// EXPORT
// =========================================================

module.exports = {
getRepaymentSchedule,
initiateRepayment,
getRepaymentHistory,
getRepayment,
makeRepayment,
};
