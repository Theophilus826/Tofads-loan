const mongoose = require("mongoose");

const Loan = require("../model/Loan");
const Repayment = require("../model/RepaymentModel");
const RepaymentSchedule = require("../model/RepaymentScheduleModel");

const LoanApplicationService = require("./LoanApplicationService");
class RepaymentSettlementService {
  /**
   * =========================================================
   * SETTLE SUCCESSFUL REPAYMENT
   * =========================================================
   *
   * Applies a successfully completed repayment to:
   *
   * 1. Repayment
   * 2. RepaymentSchedule
   * 3. Schedule installments
   * 4. Loan
   *
   * The operation is transactional and idempotent.
   *
   * A repayment can be allocated across multiple installments.
   *
   * Example:
   *
   * Repayment = ₦100,000
   *
   * Installment 1 remaining = ₦60,000
   * Installment 2 remaining = ₦40,000
   *
   * Result:
   *
   * Installment 1 = paid
   * Installment 2 = paid
   *
   * Another example:
   *
   * Repayment = ₦50,000
   *
   * Installment 1 remaining = ₦60,000
   *
   * Result:
   *
   * Installment 1 = partially_paid
   * paidAmount += ₦50,000
   * remainingAmount = ₦10,000
   *
   * =========================================================
   */
  static async settleSuccessfulRepayment({
    repaymentId,
    providerReference = null,
    providerData = null,
  }) {
    // =======================================================
    // VALIDATE REPAYMENT ID
    // =======================================================

    if (!repaymentId) {
      throw new Error("Repayment ID is required");
    }

    if (!mongoose.Types.ObjectId.isValid(repaymentId)) {
      throw new Error("Invalid repayment ID");
    }

    // =======================================================
    // START SESSION
    // =======================================================

    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      // =====================================================
      // LOAD REPAYMENT
      // =====================================================

      const repayment = await Repayment.findById(repaymentId).session(session);

      if (!repayment) {
        throw new Error("Repayment not found");
      }

      // =====================================================
      // IDEMPOTENCY
      // =====================================================

      if (repayment.status === "successful") {
        await session.commitTransaction();

        return {
          alreadySettled: true,

          repaymentId: repayment._id,

          loanId: repayment.loan,

          repaymentScheduleId: repayment.repaymentSchedule,

          status: repayment.status,

          amount: Number(repayment.amount || 0),

          allocation: repayment.allocation || [],
        };
      }

      // =====================================================
      // ONLY EXPECTED STATES CAN BE SETTLED
      // =====================================================

      if (!["pending", "processing"].includes(repayment.status)) {
        throw new Error(
          `Repayment cannot be settled from status "${repayment.status}"`,
        );
      }

      // =====================================================
      // REQUIRED RELATIONSHIPS
      // =====================================================

      if (!repayment.loan) {
        throw new Error("Repayment is not attached to a loan");
      }

      if (!repayment.repaymentSchedule) {
        throw new Error("Repayment is not attached to a repayment schedule");
      }

      // =====================================================
      // REPAYMENT AMOUNT
      // =====================================================

      const amount = Number(repayment.amount);

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Invalid repayment amount");
      }

      // =====================================================
      // LOAD LOAN
      // =====================================================

      const loan = await Loan.findById(repayment.loan).session(session);

      if (!loan) {
        throw new Error("Loan not found for repayment");
      }

      // =====================================================
      // LOAD REPAYMENT SCHEDULE
      // =====================================================

      const schedule = await RepaymentSchedule.findById(
        repayment.repaymentSchedule,
      ).session(session);

      if (!schedule) {
        throw new Error("Repayment schedule not found");
      }

      // =====================================================
      // RELATIONSHIP VALIDATION
      // =====================================================

      if (String(schedule.loan) !== String(loan._id)) {
        throw new Error("Repayment schedule does not belong to this loan");
      }

      if (String(repayment.user) !== String(loan.user)) {
        throw new Error("Repayment does not belong to the loan borrower");
      }

      if (
        repayment.loanApplication &&
        loan.loanApplication &&
        String(repayment.loanApplication) !== String(loan.loanApplication)
      ) {
        throw new Error("Repayment does not belong to this loan application");
      }

      // =====================================================
      // LOAN OUTSTANDING
      // =====================================================

      const outstandingAmount = Number(loan.outstandingAmount || 0);

      const currentLoanAmountPaid = Number(loan.amountPaid || 0);

      if (!Number.isFinite(outstandingAmount) || outstandingAmount < 0) {
        throw new Error("Invalid loan outstanding amount");
      }

      if (outstandingAmount <= 0) {
        throw new Error("Loan has no outstanding balance");
      }

      // =====================================================
      // PREVENT OVERPAYMENT
      // =====================================================

      if (amount > outstandingAmount + 0.01) {
        throw new Error(
          `Repayment amount ${amount} exceeds loan outstanding balance ${outstandingAmount}`,
        );
      }

      // =====================================================
      // SCHEDULE OUTSTANDING
      // =====================================================

      const scheduleOutstanding = Number(schedule.amountOutstanding || 0);

      if (!Number.isFinite(scheduleOutstanding) || scheduleOutstanding < 0) {
        throw new Error("Invalid repayment schedule outstanding amount");
      }

      if (scheduleOutstanding <= 0) {
        throw new Error("Repayment schedule has no outstanding balance");
      }

      // =====================================================
      // PREVENT SCHEDULE OVERPAYMENT
      // =====================================================

      if (amount > scheduleOutstanding + 0.01) {
        throw new Error(
          `Repayment amount ${amount} exceeds schedule outstanding balance ${scheduleOutstanding}`,
        );
      }

      // =====================================================
      // ALLOCATE REPAYMENT
      // =====================================================
      //
      // Allocation order:
      //
      // 1. First unpaid installment
      // 2. Then next installment
      // 3. Continue until repayment is exhausted
      //
      // This supports:
      //
      // - full payment
      // - partial payment
      // - multiple installment payment
      //
      // =====================================================

      let remainingAmount = Number(amount.toFixed(2));

      const allocation = [];

      const installments = Array.isArray(schedule.installments)
        ? schedule.installments
        : [];

      if (installments.length === 0) {
        throw new Error("Repayment schedule has no installments");
      }

      // Ensure deterministic order.
      installments.sort(
        (a, b) => Number(a.installmentNumber) - Number(b.installmentNumber),
      );

      for (const installment of installments) {
        if (remainingAmount <= 0.01) {
          break;
        }

        // ---------------------------------------------------
        // Skip fully paid installments
        // ---------------------------------------------------

        if (installment.status === "paid" || installment.status === "waived") {
          continue;
        }

        const totalAmount = Number(installment.totalAmount || 0);

        const currentPaid = Number(installment.paidAmount || 0);

        let currentRemaining = Number(installment.remainingAmount);

        // ---------------------------------------------------
        // Repair invalid/missing remainingAmount safely
        // ---------------------------------------------------

        if (!Number.isFinite(currentRemaining)) {
          currentRemaining = Math.max(totalAmount - currentPaid, 0);
        }

        if (currentRemaining <= 0.01) {
          installment.remainingAmount = 0;

          installment.paidAmount = totalAmount;

          installment.status = "paid";

          installment.paidAt = installment.paidAt || new Date();

          continue;
        }

        // ---------------------------------------------------
        // Calculate amount to apply
        // ---------------------------------------------------

        const amountToApply = Math.min(remainingAmount, currentRemaining);

        if (amountToApply <= 0) {
          continue;
        }

        // ---------------------------------------------------
        // Update installment paid amount
        // ---------------------------------------------------

        const newPaidAmount = Number((currentPaid + amountToApply).toFixed(2));

        const newRemainingAmount = Number(
          Math.max(totalAmount - newPaidAmount, 0).toFixed(2),
        );

        installment.paidAmount = newPaidAmount;

        installment.remainingAmount = newRemainingAmount;

        // ---------------------------------------------------
        // Update installment status
        // ---------------------------------------------------

        if (newRemainingAmount <= 0.01) {
          installment.paidAmount = totalAmount;

          installment.remainingAmount = 0;

          installment.status = "paid";

          installment.paidAt = new Date();
        } else {
          installment.status = "partially_paid";
        }

        // ---------------------------------------------------
        // Record allocation
        // ---------------------------------------------------

        allocation.push({
          installmentId: installment._id,

          installmentNumber: installment.installmentNumber,

          amount: Number(amountToApply.toFixed(2)),
        });

        // ---------------------------------------------------
        // Reduce repayment remainder
        // ---------------------------------------------------

        remainingAmount = Number((remainingAmount - amountToApply).toFixed(2));
      }

      // =====================================================
      // ENSURE ENTIRE PAYMENT WAS ALLOCATED
      // =====================================================

      if (remainingAmount > 0.01) {
        throw new Error(
          `Unable to allocate the complete repayment. Unallocated amount: ${remainingAmount}`,
        );
      }

      // =====================================================
      // ALLOCATION TOTAL
      // =====================================================

      const allocatedAmount = Number(
        allocation
          .reduce((total, item) => total + Number(item.amount || 0), 0)
          .toFixed(2),
      );

      const unallocatedAmount = Number(
        Math.max(amount - allocatedAmount, 0).toFixed(2),
      );

      // =====================================================
      // UPDATE REPAYMENT
      // =====================================================

      repayment.status = "successful";

      repayment.provider = repayment.provider || "paystack";

      if (providerReference) {
        repayment.providerReference = providerReference;
      }

      if (providerData) {
        repayment.providerData = providerData;
      }

      repayment.paidAt = repayment.paidAt || new Date();

      repayment.allocation = allocation;

      repayment.allocatedAmount = allocatedAmount;

      repayment.unallocatedAmount = unallocatedAmount;

      await repayment.save({
        session,
      });

      // =====================================================
      // UPDATE LOAN
      // =====================================================

      const newLoanAmountPaid = Number(
        (currentLoanAmountPaid + amount).toFixed(2),
      );

      const newLoanOutstanding = Number(
        Math.max(outstandingAmount - amount, 0).toFixed(2),
      );

      loan.amountPaid = newLoanAmountPaid;

      loan.outstandingAmount = newLoanOutstanding;

      // =====================================================
      // UPDATE LOAN STATUS
      // =====================================================

      if (newLoanOutstanding <= 0.01) {
        loan.outstandingAmount = 0;

        loan.amountPaid = Number(loan.totalRepayment);

        loan.status = "completed";
      } else if (loan.status === "defaulted") {
        // Preserve defaulted status.
        loan.status = "defaulted";
      } else if (loan.status === "overdue") {
        // Preserve overdue status.
        loan.status = "overdue";
      } else {
        loan.status = "active";
      }

      await loan.save({
        session,
      });

      // =====================================================
      // UPDATE REPAYMENT SCHEDULE
      // =====================================================

      const currentScheduleAmountPaid = Number(schedule.amountPaid || 0);

      const newScheduleAmountPaid = Number(
        (currentScheduleAmountPaid + amount).toFixed(2),
      );

      const newScheduleOutstanding = Number(
        Math.max(scheduleOutstanding - amount, 0).toFixed(2),
      );

      schedule.amountPaid = newScheduleAmountPaid;

      schedule.amountOutstanding = newScheduleOutstanding;

      // =====================================================
      // SCHEDULE STATUS
      // =====================================================

      if (newScheduleOutstanding <= 0.01) {
        schedule.amountOutstanding = 0;

        schedule.amountPaid = Number(schedule.totalRepaymentAmount);

        schedule.status = "paid";
      } else {
        const hasOverdueInstallment = schedule.installments.some(
          (installment) =>
            installment.status === "overdue" &&
            Number(installment.remainingAmount || 0) > 0,
        );

        if (hasOverdueInstallment) {
          schedule.status = "overdue";
        } else {
          schedule.status = "partially_paid";
        }
      }

      await schedule.save({
        session,
      });

      // =====================================================
      // COMMIT TRANSACTION
      // =====================================================

      await session.commitTransaction();

      // =======================================================
      // COMPLETE RELATED LOAN APPLICATION
      // =======================================================
      //
      // The application is completed only when the actual
      // loan has been fully repaid.
      //

      if (loan.status === "completed" && loan.loanApplication) {
        await LoanApplicationService.completeApplicationFromRepayment(
          loan.loanApplication,
        );
      }
      // =====================================================
      // RETURN RESULT
      // =====================================================

      return {
        settled: true,

        repaymentId: repayment._id,

        loanId: loan._id,

        repaymentScheduleId: schedule._id,

        amount,

        allocation,

        allocatedAmount,

        unallocatedAmount,

        repaymentStatus: repayment.status,

        loanStatus: loan.status,

        loanAmountPaid: loan.amountPaid,

        loanOutstandingAmount: loan.outstandingAmount,

        scheduleStatus: schedule.status,

        scheduleAmountPaid: schedule.amountPaid,

        scheduleAmountOutstanding: schedule.amountOutstanding,
      };
    } catch (error) {
      // =====================================================
      // ABORT TRANSACTION
      // =====================================================

      try {
        await session.abortTransaction();
      } catch (abortError) {
        // Do not hide the original error.
      }

      throw error;
    } finally {
      // =====================================================
      // END SESSION
      // =====================================================

      await session.endSession();
    }
  }
}

module.exports = RepaymentSettlementService;
