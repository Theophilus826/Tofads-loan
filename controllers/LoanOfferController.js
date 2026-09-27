const mongoose = require("mongoose");
const LoanOfferService = require("../services/LoanOfferService");
const LoanApplication = require("../model/LoanApplication");
const LoanOffer = require("../model/LoanOfferModel");

// =========================================================
// ADMIN - CREATE LOAN OFFER
// =========================================================

const createOffer = async (req, res, next) => {
  try {
    const { applicationId } = req.params;
    const adminId = req.user?._id;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        message: "Loan application ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan application ID",
      });
    }

    const application = await LoanApplication.findById(applicationId)
      .populate("loanProduct")
      .populate("user");

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Loan application not found",
      });
    }

    console.log("CREATE OFFER: Application:", {
      applicationId: application._id,
      applicationNumber: application.applicationNumber,
      userId: application.user?._id,
      status: application.status,
      creditScore: application.creditScore,
      creditAssessment: application.creditAssessment,
      creditDecision: application.creditDecision,
    });

    if (
      application.status !== "approved" &&
      application.status !== "offer_created"
    ) {
      return res.status(400).json({
        success: false,
        message: "Application must be approved before creating an offer",
        currentStatus: application.status,
      });
    }

    const product = application.loanProduct;

    if (!product) {
      return res.status(400).json({
        success: false,
        message: "Loan product is missing from this application",
      });
    }

    if (!application.user) {
      return res.status(400).json({
        success: false,
        message: "Customer is missing from this application",
      });
    }

    // ---------------------------------------------------------
    // PREVENT DUPLICATE OFFER
    // ---------------------------------------------------------

    const existingOffer = await LoanOffer.findOne({
      loanApplication: application._id,
    })
      .populate("user", "name email phone avatar")
      .populate("loanProduct")
      .populate("loanApplication")
      .populate("creditAssessment");

    if (existingOffer) {
      return res.status(200).json({
        success: true,
        message: "Loan offer already exists",
        data: existingOffer,
      });
    }

    // ---------------------------------------------------------
    // APPROVED AMOUNT
    // ---------------------------------------------------------

    const approvedAmount = Number(req.body.approvedAmount);

    if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid approved amount is required",
      });
    }

    const requestedAmount = Number(application.amountRequested);

    if (
      !Number.isFinite(requestedAmount) ||
      requestedAmount <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Application does not contain a valid requested amount",
      });
    }

    // Do not allow admin to approve more than requested.
    if (approvedAmount > requestedAmount) {
      return res.status(400).json({
        success: false,
        message: `Approved amount cannot exceed requested amount of ${requestedAmount}`,
      });
    }

    // ---------------------------------------------------------
    // DURATION
    // ---------------------------------------------------------

    const durationDays = Number(application.durationDays);

    if (!Number.isFinite(durationDays) || durationDays <= 0) {
      return res.status(400).json({
        success: false,
        message: "Application does not contain a valid duration",
      });
    }

    // ---------------------------------------------------------
    // PRODUCT VALUES
    // ---------------------------------------------------------

    const interestRate = Number(product.interestRate) || 0;

    // ---------------------------------------------------------
    // INTEREST
    // ---------------------------------------------------------

    const totalInterest =
      approvedAmount *
      (interestRate / 100) *
      (durationDays / 30);

    // ---------------------------------------------------------
    // PROCESSING FEE
    // ---------------------------------------------------------

    const processingFee =
      product.processingFeeType === "percentage"
        ? approvedAmount *
          ((Number(product.processingFee) || 0) / 100)
        : Number(product.processingFee) || 0;

    // ---------------------------------------------------------
    // SERVICE FEE
    // ---------------------------------------------------------

    const serviceFee = Number(product.serviceFee) || 0;

    // ---------------------------------------------------------
    // TOTALS
    // ---------------------------------------------------------

    const totalFees = processingFee + serviceFee;

    const totalRepayment =
      approvedAmount +
      totalInterest +
      totalFees;

    // ---------------------------------------------------------
    // INSTALLMENTS
    // ---------------------------------------------------------

    let numberOfInstallments;

    switch (product.repaymentFrequency) {
      case "daily":
        numberOfInstallments = durationDays;
        break;

      case "weekly":
        numberOfInstallments = Math.ceil(durationDays / 7);
        break;

      case "biweekly":
        numberOfInstallments = Math.ceil(durationDays / 14);
        break;

      case "monthly":
      default:
        numberOfInstallments = Math.ceil(durationDays / 30);
        break;
    }

    numberOfInstallments = Math.max(
      numberOfInstallments,
      1,
    );

    const installmentAmount =
      totalRepayment / numberOfInstallments;

    // ---------------------------------------------------------
    // EXPIRY
    // ---------------------------------------------------------

    const expiresAt = new Date();

    expiresAt.setDate(
      expiresAt.getDate() + 7,
    );

    // ---------------------------------------------------------
    // CREATE OFFER DATA
    // ---------------------------------------------------------

    const offerData = {
      user: application.user._id,

      loanApplication: application._id,

      loanProduct: product._id,

      approvedAmount,

      interestRate,

      interestType: product.interestType,

      processingFee,

      serviceFee,

      totalInterest,

      totalFees,

      totalRepayment,

      durationDays,

      repaymentFrequency:
        product.repaymentFrequency,

      installmentAmount,

      numberOfInstallments,

      status: "pending",

      expiresAt,

      createdBy: adminId,
    };

    /*
     * Credit assessment is OPTIONAL.
     *
     * Only attach it when the application actually
     * has one. Do not send `undefined` unnecessarily.
     */
    if (application.creditAssessment) {
      offerData.creditAssessment =
        application.creditAssessment;
    }

    console.log(
      "CREATE OFFER: Creating offer:",
      offerData,
    );

    // ---------------------------------------------------------
    // CREATE
    // ---------------------------------------------------------

    const offer =
      await LoanOffer.create(offerData);

    // ---------------------------------------------------------
    // UPDATE APPLICATION
    // ---------------------------------------------------------

    application.status = "offer_created";

    await application.save();

    // ---------------------------------------------------------
    // POPULATE OFFER
    // ---------------------------------------------------------

    const populatedOffer =
      await LoanOffer.findById(offer._id)
        .populate(
          "user",
          "name email phone avatar",
        )
        .populate(
          "loanProduct",
          `
            name
            title
            code
            currency
            minAmount
            maxAmount
            minDurationDays
            maxDurationDays
            interestRate
            interestType
            processingFee
            processingFeeType
            serviceFee
            repaymentFrequency
          `,
        )
        .populate("loanApplication")
        .populate("creditAssessment");

    return res.status(201).json({
      success: true,
      message: "Loan offer created successfully",
      data: populatedOffer,
    });
  } catch (error) {
    console.error(
      "CREATE LOAN OFFER ERROR:",
      error,
    );

    if (error.name === "ValidationError") {
      const errors = {};

      for (const [
        field,
        validationError,
      ] of Object.entries(error.errors || {})) {
        errors[field] =
          validationError.message;
      }

      return res.status(400).json({
        success: false,
        message: "Invalid loan offer data",
        errors,
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: `Invalid value for ${error.path}`,
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "A loan offer already exists for this application",
      });
    }

    next(error);
  }
};

// =========================================================
// CUSTOMER - GET SINGLE OFFER
// =========================================================

const getOffer = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const offerId = req.params.id;

    console.log("======================================");
    console.log("GET SINGLE LOAN OFFER");
    console.log("Offer ID:", offerId);
    console.log("User:", userId);
    console.log("======================================");

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    if (!offerId) {
      return res.status(400).json({
        success: false,
        message: "Loan offer ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(offerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan offer ID",
        received: offerId,
      });
    }

    const offer = await LoanOfferService.getOffer(userId, offerId);

    return res.status(200).json({
      success: true,
      data: offer,
    });
  } catch (error) {
    console.error("GET LOAN OFFER ERROR:", error);
    next(error);
  }
};

// =========================================================
// CUSTOMER - GET MY OFFERS
// =========================================================

const getMyOffers = async (req, res, next) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    const offers = await LoanOfferService.getMyOffers(userId);

    return res.status(200).json({
      success: true,
      count: offers.length,
      data: offers,
    });
  } catch (error) {
    console.error("GET MY LOAN OFFERS ERROR:", error);
    next(error);
  }
};

// =========================================================
// CUSTOMER - ACCEPT OFFER
// =========================================================

// =========================================================
// ACCEPT LOAN OFFER
// POST /api/loan-offers/:id/accept
// =========================================================

const acceptOffer = async (req, res, next) => {
  try {
    // -----------------------------------------------------
    // AUTHENTICATION
    // -----------------------------------------------------

    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    // -----------------------------------------------------
    // PARAMETER
    // -----------------------------------------------------

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Loan offer ID is required",
      });
    }

    // -----------------------------------------------------
    // ACCEPT OFFER
    // -----------------------------------------------------

    const offer = await LoanOfferService.acceptOffer(
      userId,
      id
    );

    // -----------------------------------------------------
    // RESPONSE
    // -----------------------------------------------------

    return res.status(200).json({
      success: true,
      message: "Loan offer accepted successfully",
      data: offer,
    });
  } catch (error) {
    console.error(
      "ACCEPT LOAN OFFER ERROR:",
      error
    );

    next(error);
  }
};

// =========================================================
// CUSTOMER - REJECT OFFER
// =========================================================

const rejectOffer = async (req, res, next) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    const offer = await LoanOfferService.rejectOffer(userId, req.params.id);

    return res.status(200).json({
      success: true,
      message: "Loan offer rejected successfully",
      data: offer,
    });
  } catch (error) {
    console.error("REJECT LOAN OFFER ERROR:", error);
    next(error);
  }
};

// =========================================================
// ADMIN - GET ALL OFFERS
// =========================================================

const getAllOffers = async (req, res, next) => {
  try {
    const offers = await LoanOffer.find({})
      .populate("user", "name email phone avatar")
      .populate("loanProduct")
      .populate("loanApplication")
      .populate("creditAssessment")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: offers.length,
      data: offers,
    });
  } catch (error) {
    console.error("GET ALL LOAN OFFERS ERROR:", error);
    next(error);
  }
};

// =========================================================
// ADMIN - GET SINGLE OFFER
// =========================================================

const getAdminOffer = async (req, res, next) => {
  try {
    const offer = await LoanOffer.findById(req.params.id)
      .populate("user", "name email phone avatar")
      .populate("loanProduct")
      .populate("loanApplication")
      .populate("creditAssessment")
      .lean();

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Loan offer not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: offer,
    });
  } catch (error) {
    console.error("GET ADMIN LOAN OFFER ERROR:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid loan offer ID",
      });
    }

    next(error);
  }
};

const getApprovedApplications = async (req, res, next) => {
  try {
    const applications = await LoanApplication.find({
      status: {
        $in: ["approved", "offer_created"],
      },
    })
      .populate("user", "name email phone")
      .populate(
        "loanProduct",
        `
          name
          title
          code
          currency
          minAmount
          maxAmount
          minDurationDays
          maxDurationDays
          interestRate
          interestType
          processingFee
          processingFeeType
          serviceFee
          repaymentFrequency
        `,
      )
      .populate("creditAssessment")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: applications.length,
      data: applications,
    });
  } catch (error) {
    console.error("GET APPROVED APPLICATIONS ERROR:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: `Invalid value for ${error.path}`,
      });
    }

    next(error);
  }
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  createOffer,
  getOffer,
  getMyOffers,
  getApprovedApplications,
  acceptOffer,
  rejectOffer,
  getAllOffers,
  getAdminOffer,
};
