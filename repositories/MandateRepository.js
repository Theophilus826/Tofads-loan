
const Mandate = require("../model/MandateModel");
const BankAccount = require("../model/BankAccountModel");

// =========================================================
// POPULATION
// =========================================================
//
// IMPORTANT:
//
// MandateModel does NOT contain a `bankAccount` field.
//
// Therefore NEVER do:
//
//   .populate("bankAccount")
//
// Bank accounts are resolved separately from the borrower/user
// through BankAccountRepository.
//
// Mandate queries only populate relationships that actually
// exist on MandateModel.
//

const populateMandate = (query) => {
  return query
    .populate("loanApplication")
    .populate("loanOffer");
};

const populateMandateWithAuthorization = (query) => {
  return query
    .select("+authorizationCode")
    .populate("loanApplication")
    .populate("loanOffer");
};

// =========================================================
// CREATE
// =========================================================

const create = async (data) => {
  if (!data || typeof data !== "object") {
    throw new Error("Mandate data is required");
  }

  return Mandate.create(data);
};

// =========================================================
// FIND BY ID
// =========================================================

const findById = async (
  mandateId,
  userId,
) => {
  if (!mandateId || !userId) {
    return null;
  }

  return populateMandate(
    Mandate.findOne({
      _id: mandateId,
      user: userId,
    }),
  );
};

const findByIdWithAuthorization = async (
  mandateId,
  userId,
) => {
  if (!mandateId || !userId) {
    return null;
  }

  return populateMandateWithAuthorization(
    Mandate.findOne({
      _id: mandateId,
      user: userId,
    }),
  );
};

// =========================================================
// PRIMARY BANK ACCOUNT
// =========================================================
//
// New mandates should use the user's verified primary account.
//
// The bank account is NOT stored/populated from MandateModel.
// Resolve it directly from BankAccountModel.
//

const findPrimaryBankAccount = async (
  userId,
) => {
  if (!userId) {
    return null;
  }

  return BankAccount.findOne({
    user: userId,
    isPrimary: true,
    verificationStatus: "verified",
  }).select("+accountNumber");
};

const findPrimaryBankAccountById = async (
  userId,
  bankAccountId,
) => {
  if (!userId || !bankAccountId) {
    return null;
  }

  return BankAccount.findOne({
    _id: bankAccountId,
    user: userId,
    isPrimary: true,
    verificationStatus: "verified",
  }).select("+accountNumber");
};

// =========================================================
// FIND BY LOAN APPLICATION
// =========================================================

const findByLoanApplication = async (
  loanApplicationId,
) => {
  if (!loanApplicationId) {
    return null;
  }

  return populateMandate(
    Mandate.findOne({
      loanApplication:
        loanApplicationId,
    }).sort({
      createdAt: -1,
    }),
  );
};

const findByLoanApplicationWithAuthorization =
  async (loanApplicationId) => {
    if (!loanApplicationId) {
      return null;
    }

    return populateMandateWithAuthorization(
      Mandate.findOne({
        loanApplication:
          loanApplicationId,
      }).sort({
        createdAt: -1,
      }),
    );
  };

// =========================================================
// FIND BY LOAN OFFER
// =========================================================

const findByLoanOffer = async (
  loanOfferId,
) => {
  if (!loanOfferId) {
    return null;
  }

  return populateMandate(
    Mandate.findOne({
      loanOffer: loanOfferId,
    }).sort({
      createdAt: -1,
    }),
  );
};

// =========================================================
// CURRENT / ACTIVE MANDATE BY USER
// =========================================================

const CURRENT_MANDATE_STATUSES = [
  "pending",
  "authorization_required",
  "authorized",
  "active",
];

const findActiveByUser = async (
  userId,
  loanApplicationId = null,
) => {
  if (!userId) {
    return null;
  }

  const filter = {
    user: userId,

    status: {
      $in: CURRENT_MANDATE_STATUSES,
    },
  };

  if (loanApplicationId) {
    filter.loanApplication =
      loanApplicationId;
  }

  return populateMandate(
    Mandate.findOne(filter).sort({
      createdAt: -1,
    }),
  );
};

// =========================================================
// ACTIVE MANDATE FOR LOAN
// =========================================================

const findActiveForLoan = async (
  userId,
  loanApplicationId,
) => {
  if (!userId || !loanApplicationId) {
    return null;
  }

  return populateMandate(
    Mandate.findOne({
      user: userId,

      loanApplication:
        loanApplicationId,

      status: "active",
    }).sort({
      createdAt: -1,
    }),
  );
};

// =========================================================
// CURRENT MANDATE FOR OFFER
// =========================================================
//
// Includes pending/authorization states because the frontend
// may need to retrieve a mandate while Paystack authorization
// is still in progress.
//

const findActiveForOffer = async (
  userId,
  offerId,
) => {
  if (!userId || !offerId) {
    return null;
  }

  return populateMandate(
    Mandate.findOne({
      user: userId,

      loanOffer: offerId,

      status: {
        $in: CURRENT_MANDATE_STATUSES,
      },
    }).sort({
      createdAt: -1,
    }),
  );
};

// =========================================================
// FIND BY PAYSTACK MANDATE ID
// =========================================================

const findByProviderId = async (
  providerMandateId,
) => {
  if (!providerMandateId) {
    return null;
  }

  return populateMandate(
    Mandate.findOne({
      providerMandateId,
    }),
  );
};

const findByProviderIdWithAuthorization =
  async (providerMandateId) => {
    if (!providerMandateId) {
      return null;
    }

    return populateMandateWithAuthorization(
      Mandate.findOne({
        providerMandateId,
      }),
    );
  };

// =========================================================
// FIND BY PAYSTACK AUTHORIZATION REFERENCE
// =========================================================

const findByAuthorizationReference =
  async (
    authorizationReference,
  ) => {
    if (!authorizationReference) {
      return null;
    }

    return populateMandate(
      Mandate.findOne({
        authorizationReference,
      }),
    );
  };

const findByAuthorizationReferenceWithAuthorization =
  async (
    authorizationReference,
  ) => {
    if (!authorizationReference) {
      return null;
    }

    return populateMandateWithAuthorization(
      Mandate.findOne({
        authorizationReference,
      }),
    );
  };

const findPendingByAuthorizationReference =
  async (
    authorizationReference,
  ) => {
    if (!authorizationReference) {
      return null;
    }

    return populateMandate(
      Mandate.findOne({
        authorizationReference,

        status: {
          $in: [
            "pending",
            "authorization_required",
            "authorized",
          ],
        },
      }),
    );
  };

const findPendingByAuthorizationReferenceWithAuthorization =
  async (
    authorizationReference,
  ) => {
    if (!authorizationReference) {
      return null;
    }

    return populateMandateWithAuthorization(
      Mandate.findOne({
        authorizationReference,

        status: {
          $in: [
            "pending",
            "authorization_required",
            "authorized",
          ],
        },
      }),
    );
  };

// =========================================================
// FIND BY PAYSTACK CUSTOMER ID
// =========================================================

const findByProviderCustomerId = async (
  providerCustomerId,
) => {
  if (!providerCustomerId) {
    return null;
  }

  return populateMandate(
    Mandate.findOne({
      providerCustomerId,
    }).sort({
      updatedAt: -1,
      createdAt: -1,
    }),
  );
};

const findByProviderCustomerIdWithAuthorization =
  async (providerCustomerId) => {
    if (!providerCustomerId) {
      return null;
    }

    return populateMandateWithAuthorization(
      Mandate.findOne({
        providerCustomerId,
      }).sort({
        updatedAt: -1,
        createdAt: -1,
      }),
    );
  };

const findActiveByProviderCustomerId =
  async (providerCustomerId) => {
    if (!providerCustomerId) {
      return null;
    }

    return populateMandate(
      Mandate.findOne({
        providerCustomerId,

        status: {
          $in: CURRENT_MANDATE_STATUSES,
        },
      }).sort({
        updatedAt: -1,
        createdAt: -1,
      }),
    );
  };

const findActiveByProviderCustomerIdWithAuthorization =
  async (providerCustomerId) => {
    if (!providerCustomerId) {
      return null;
    }

    return populateMandateWithAuthorization(
      Mandate.findOne({
        providerCustomerId,

        status: {
          $in: CURRENT_MANDATE_STATUSES,
        },
      }).sort({
        updatedAt: -1,
        createdAt: -1,
      }),
    );
  };

const findPendingByProviderCustomerId =
  async (providerCustomerId) => {
    if (!providerCustomerId) {
      return null;
    }

    return populateMandate(
      Mandate.findOne({
        providerCustomerId,

        status: {
          $in: [
            "pending",
            "authorization_required",
          ],
        },
      }).sort({
        updatedAt: -1,
        createdAt: -1,
      }),
    );
  };

const findPendingByProviderCustomerIdWithAuthorization =
  async (providerCustomerId) => {
    if (!providerCustomerId) {
      return null;
    }

    return populateMandateWithAuthorization(
      Mandate.findOne({
        providerCustomerId,

        status: {
          $in: [
            "pending",
            "authorization_required",
          ],
        },
      }).sort({
        updatedAt: -1,
        createdAt: -1,
      }),
    );
  };

// =========================================================
// FIND BY AUTHORIZATION CODE
// =========================================================

const findByAuthorizationCode = async (
  authorizationCode,
) => {
  if (!authorizationCode) {
    return null;
  }

  return populateMandateWithAuthorization(
    Mandate.findOne({
      authorizationCode,
    }),
  );
};

// =========================================================
// FIND BY INTERNAL MANDATE REFERENCE
// =========================================================

const findByReference = async (
  mandateReference,
) => {
  if (!mandateReference) {
    return null;
  }

  return populateMandate(
    Mandate.findOne({
      mandateReference,
    }),
  );
};

const findByReferenceWithAuthorization =
  async (mandateReference) => {
    if (!mandateReference) {
      return null;
    }

    return populateMandateWithAuthorization(
      Mandate.findOne({
        mandateReference,
      }),
    );
  };

// =========================================================
// FIND PENDING MANDATES
// =========================================================

const findPending = async () => {
  return populateMandate(
    Mandate.find({
      status: {
        $in: [
          "pending",
          "authorization_required",
        ],
      },
    }).sort({
      createdAt: 1,
    }),
  );
};

// =========================================================
// USER-SCOPED UPDATE
// =========================================================

const updateById = async (
  mandateId,
  userId,
  update,
) => {
  if (!mandateId || !userId) {
    return null;
  }

  return populateMandate(
    Mandate.findOneAndUpdate(
      {
        _id: mandateId,
        user: userId,
      },

      {
        $set: update,
      },

      {
        returnDocument: "after",
        runValidators: true,
      },
    ),
  );
};

const updateByIdWithAuthorization =
  async (
    mandateId,
    userId,
    update,
  ) => {
    if (!mandateId || !userId) {
      return null;
    }

    return populateMandateWithAuthorization(
      Mandate.findOneAndUpdate(
        {
          _id: mandateId,
          user: userId,
        },

        {
          $set: update,
        },

        {
          returnDocument: "after",
          runValidators: true,
        },
      ),
    );
  };

// =========================================================
// UPDATE BY PROVIDER MANDATE ID
// =========================================================

const updateByProviderId = async (
  providerMandateId,
  update,
) => {
  if (!providerMandateId) {
    return null;
  }

  return populateMandate(
    Mandate.findOneAndUpdate(
      {
        providerMandateId,
      },

      {
        $set: update,
      },

      {
        returnDocument: "after",
        runValidators: true,
      },
    ),
  );
};

// =========================================================
// UPDATE BY PAYSTACK AUTHORIZATION REFERENCE
// =========================================================

const updateByAuthorizationReference =
  async (
    authorizationReference,
    update,
  ) => {
    if (!authorizationReference) {
      return null;
    }

    return populateMandate(
      Mandate.findOneAndUpdate(
        {
          authorizationReference,
        },

        {
          $set: update,
        },

        {
          returnDocument: "after",
          runValidators: true,
        },
      ),
    );
  };

const updateByAuthorizationReferenceWithAuthorization =
  async (
    authorizationReference,
    update,
  ) => {
    if (!authorizationReference) {
      return null;
    }

    return populateMandateWithAuthorization(
      Mandate.findOneAndUpdate(
        {
          authorizationReference,
        },

        {
          $set: update,
        },

        {
          returnDocument: "after",
          runValidators: true,
        },
      ),
    );
  };

// =========================================================
// UPDATE BY PROVIDER CUSTOMER ID
// =========================================================

const updateByProviderCustomerId = async (
  providerCustomerId,
  update,
) => {
  if (!providerCustomerId) {
    return null;
  }

  return populateMandate(
    Mandate.findOneAndUpdate(
      {
        providerCustomerId,

        status: {
          $in: CURRENT_MANDATE_STATUSES,
        },
      },

      {
        $set: update,
      },

      {
        returnDocument: "after",
        runValidators: true,

        sort: {
          updatedAt: -1,
          createdAt: -1,
        },
      },
    ),
  );
};

// =========================================================
// UPDATE BY AUTHORIZATION CODE
// =========================================================

const updateByAuthorizationCode = async (
  authorizationCode,
  update,
) => {
  if (!authorizationCode) {
    return null;
  }

  return populateMandateWithAuthorization(
    Mandate.findOneAndUpdate(
      {
        authorizationCode,
      },

      {
        $set: update,
      },

      {
        returnDocument: "after",
        runValidators: true,
      },
    ),
  );
};

// =========================================================
// SAVE PROVIDER CUSTOMER ID
// =========================================================

const saveProviderCustomerId = async (
  mandateId,
  providerCustomerId,
) => {
  if (!mandateId || !providerCustomerId) {
    return null;
  }

  return populateMandate(
    Mandate.findByIdAndUpdate(
      mandateId,

      {
        $set: {
          providerCustomerId,
        },
      },

      {
        returnDocument: "after",
        runValidators: true,
      },
    ),
  );
};

// =========================================================
// SAVE AUTHORIZATION CODE
// =========================================================

const saveAuthorizationCode = async (
  mandateId,
  authorizationCode,
  authorizationReference = null,
) => {
  if (!mandateId || !authorizationCode) {
    return null;
  }

  const update = {
    authorizationCode,
  };

  if (authorizationReference) {
    update.authorizationReference =
      authorizationReference;
  }

  return populateMandateWithAuthorization(
    Mandate.findByIdAndUpdate(
      mandateId,

      {
        $set: update,
      },

      {
        returnDocument: "after",
        runValidators: true,
      },
    ),
  );
};

// =========================================================
// CANCEL
// =========================================================

const cancel = async (
  mandateId,
  userId,
) => {
  if (!mandateId || !userId) {
    return null;
  }

  return populateMandate(
    Mandate.findOneAndUpdate(
      {
        _id: mandateId,

        user: userId,

        status: {
          $nin: [
            "cancelled",
            "expired",
          ],
        },
      },

      {
        $set: {
          status: "cancelled",
          cancelledAt: new Date(),
        },
      },

      {
        returnDocument: "after",
        runValidators: true,
      },
    ),
  );
};

const cancelWithAuthorization = async (
  mandateId,
  userId,
) => {
  if (!mandateId || !userId) {
    return null;
  }

  return populateMandateWithAuthorization(
    Mandate.findOneAndUpdate(
      {
        _id: mandateId,

        user: userId,

        status: {
          $nin: [
            "cancelled",
            "expired",
          ],
        },
      },

      {
        $set: {
          status: "cancelled",
          cancelledAt: new Date(),
        },
      },

      {
        returnDocument: "after",
        runValidators: true,
      },
    ),
  );
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  // Population
  populateMandate,
  populateMandateWithAuthorization,

  // Create
  create,

  // ID
  findById,
  findByIdWithAuthorization,

  // Primary bank account
  findPrimaryBankAccount,
  findPrimaryBankAccountById,

  // Loan application
  findByLoanApplication,
  findByLoanApplicationWithAuthorization,

  // Loan offer
  findByLoanOffer,

  // Current / active
  findActiveByUser,
  findActiveForLoan,
  findActiveForOffer,

  // Provider mandate ID
  findByProviderId,
  findByProviderIdWithAuthorization,
  updateByProviderId,

  // Paystack authorization reference
  findByAuthorizationReference,
  findByAuthorizationReferenceWithAuthorization,
  findPendingByAuthorizationReference,
  findPendingByAuthorizationReferenceWithAuthorization,
  updateByAuthorizationReference,
  updateByAuthorizationReferenceWithAuthorization,

  // Provider customer
  findByProviderCustomerId,
  findByProviderCustomerIdWithAuthorization,
  findActiveByProviderCustomerId,
  findActiveByProviderCustomerIdWithAuthorization,
  findPendingByProviderCustomerId,
  findPendingByProviderCustomerIdWithAuthorization,
  updateByProviderCustomerId,

  // Authorization code
  findByAuthorizationCode,
  updateByAuthorizationCode,

  // Internal reference
  findByReference,
  findByReferenceWithAuthorization,

  // Pending
  findPending,

  // User-scoped updates
  updateById,
  updateByIdWithAuthorization,

  // Provider data
  saveProviderCustomerId,
  saveAuthorizationCode,

  // Cancellation
  cancel,
  cancelWithAuthorization,
};
