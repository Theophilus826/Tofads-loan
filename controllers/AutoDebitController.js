
const AutoDebitRepository = require(
  "../repositories/AutoDebitRepository"
);

const AutoDebitService = require(
  "../services/AutoDebitService"
);

// =========================================================
// INITIATE AUTO DEBIT
// =========================================================

const initiateAutoDebit = async (
  req,
  res,
  next
) => {
  try {
    const {
      repaymentScheduleId,
      amount,
    } = req.body;

    if (!repaymentScheduleId) {
      return res.status(400).json({
        success: false,
        message:
          "Repayment schedule ID is required",
      });
    }

    const result =
      await AutoDebitService.createAutoDebit({
        userId: req.user._id,

        repaymentScheduleId,

        amount,
      });

    return res.status(201).json({
      success: true,

      message:
        "Auto debit initiated successfully",

      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET USER AUTO DEBITS
// =========================================================

const getMyAutoDebits = async (
  req,
  res,
  next
) => {
  try {
    const debits =
      await AutoDebitRepository.findByUser(
        req.user._id
      );

    return res.status(200).json({
      success: true,

      count: debits.length,

      data: debits,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET AUTO DEBIT
// =========================================================

const getAutoDebit = async (
  req,
  res,
  next
) => {
  try {
    const debit =
      await AutoDebitRepository.findById(
        req.params.debitId,
        req.user._id
      );

    if (!debit) {
      return res.status(404).json({
        success: false,
        message:
          "Auto debit not found",
      });
    }

    return res.status(200).json({
      success: true,

      data: debit,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// PROVIDER SUCCESS WEBHOOK
// =========================================================

const handleSuccessfulDebit = async (
  req,
  res,
  next
) => {
  try {
    const {
      debitId,
      providerReference,
      ...payload
    } = req.body;

    let debit = null;

    if (debitId) {
      debit =
        await AutoDebitRepository.findById(
          debitId
        );
    }

    if (
      !debit &&
      providerReference
    ) {
      debit =
        await AutoDebitRepository
          .findByProviderReference(
            providerReference
          );
    }

    if (!debit) {
      return res.status(404).json({
        success: false,
        message:
          "Auto debit not found",
      });
    }

    const result =
      await AutoDebitService
        .handleSuccessfulDebit(
          debit._id,
          {
            providerReference,
            ...payload,
          }
        );

    return res.status(200).json({
      success: true,

      message:
        "Auto debit processed successfully",

      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// PROVIDER FAILED WEBHOOK
// =========================================================

const handleFailedDebit = async (
  req,
  res,
  next
) => {
  try {
    const {
      debitId,
      providerReference,
      reason,
      ...payload
    } = req.body;

    let debit = null;

    if (debitId) {
      debit =
        await AutoDebitRepository.findById(
          debitId
        );
    }

    if (
      !debit &&
      providerReference
    ) {
      debit =
        await AutoDebitRepository
          .findByProviderReference(
            providerReference
          );
    }

    if (!debit) {
      return res.status(404).json({
        success: false,
        message:
          "Auto debit not found",
      });
    }

    const result =
      await AutoDebitService
        .handleFailedDebit(
          debit._id,

          reason ||
            "Auto debit failed",

          {
            providerReference,
            ...payload,
          }
        );

    return res.status(200).json({
      success: true,

      message:
        "Auto debit failure recorded",

      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// EXPORT
// =========================================================

module.exports = {
  initiateAutoDebit,
  getMyAutoDebits,
  getAutoDebit,
  handleSuccessfulDebit,
  handleFailedDebit,
};

