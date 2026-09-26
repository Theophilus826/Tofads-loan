const Repayment = require("../model/RepaymentModel");

// =========================================================
// CREATE
// =========================================================

const create = async (
data,
options = {}
) => {
const result = await Repayment.create(
[data],
options
);

return result[0];
};

// =========================================================
// CUSTOMER
// =========================================================

const findById = async (
repaymentId,
userId
) => {
return Repayment.findOne({
_id: repaymentId,
user: userId,
})
.populate(
"loan",
"loanNumber principalAmount totalRepayment amountPaid outstandingAmount status repaymentFrequency"
)
.populate(
"repaymentSchedule"
)
.populate(
"loanApplication",
"applicationNumber amountRequested status"
);
};

// =========================================================
// INTERNAL
// =========================================================

const findByIdInternal = async (
repaymentId,
session = null
) => {
const query =
Repayment.findById(repaymentId);

if (session) {
query.session(session);
}

return query;
};

// =========================================================
// ADMIN
// =========================================================

const findByIdAdmin = async (
repaymentId
) => {
return Repayment.findById(
repaymentId
)
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
"repaymentSchedule"
);
};

// =========================================================
// PROVIDER REFERENCE
// =========================================================

const findByProviderReference = async (
providerReference
) => {
if (
!providerReference ||
!String(providerReference).trim()
) {
return null;
}

return Repayment.findOne({
providerReference:
String(providerReference).trim(),
});
};

// =========================================================
// PAYMENT REFERENCE
// =========================================================

const findByPaymentReference = async (
paymentReference
) => {
if (
!paymentReference ||
!String(paymentReference).trim()
) {
return null;
}

return Repayment.findOne({
paymentReference:
String(paymentReference).trim(),
});
};

// =========================================================
// PENDING PAYMENT
// =========================================================

const findPendingByReference = async (
paymentReference
) => {
if (
!paymentReference ||
!String(paymentReference).trim()
) {
return null;
}

return Repayment.findOne({
paymentReference:
String(paymentReference).trim(),


status: {
  $in: [
    "pending",
    "processing",
  ],
},


});
};

// =========================================================
// BY LOAN
// =========================================================

const findByLoan = async (
loanId
) => {
return Repayment.find({
loan: loanId,
})
.populate(
"loan",
"loanNumber principalAmount totalRepayment amountPaid outstandingAmount status repaymentFrequency"
)
.sort({
createdAt: -1,
});
};

// =========================================================
// BY SCHEDULE
// =========================================================

const findBySchedule = async (
repaymentScheduleId
) => {
return Repayment.find({
repaymentSchedule:
repaymentScheduleId,
}).sort({
createdAt: -1,
});
};

// =========================================================
// BY USER
// =========================================================

const findByUser = async (
userId
) => {
return Repayment.find({
user: userId,
})
.populate(
"loan",
"loanNumber principalAmount totalRepayment amountPaid outstandingAmount status"
)
.populate(
"repaymentSchedule",
"principalAmount totalRepaymentAmount amountPaid amountOutstanding status startDate finalDueDate"
)
.populate(
"loanApplication",
"applicationNumber amountRequested status"
)
.sort({
createdAt: -1,
});
};

// =========================================================
// ALL / ADMIN
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
Math.max(
1,
Number(limit) || 20
)
);

const skip =
(safePage - 1) *
safeLimit;

const [
items,
total,
] = await Promise.all([
Repayment.find(query)
.populate(
"user",
"firstName lastName name email phone"
)
.populate(
"loan",
"loanNumber principalAmount totalRepayment amountPaid outstandingAmount status"
)
.populate(
"loanApplication",
"applicationNumber amountRequested status"
)
.populate(
"repaymentSchedule",
"principalAmount totalRepaymentAmount amountPaid amountOutstanding status"
)
.sort({
createdAt: -1,
})
.skip(skip)
.limit(safeLimit),

```
Repayment.countDocuments(query),
```

]);

return {
items,
total,
page: safePage,
limit: safeLimit,
totalPages:
Math.ceil(
total / safeLimit
),
};
};

// =========================================================
// UPDATE
// =========================================================

const updateById = async (
repaymentId,
update,
options = {}
) => {
return Repayment.findByIdAndUpdate(
repaymentId,
{
$set: update,
},
{
returnDocument: "after",
runValidators: true,
...options,
}
);
};

// =========================================================
// ATOMIC STATUS UPDATE
// =========================================================

const updateStatusIfCurrent = async (
repaymentId,
currentStatuses,
update,
options = {}
) => {
return Repayment.findOneAndUpdate(
{
_id: repaymentId,


  status: {
    $in: currentStatuses,
  },
},
{
  $set: update,
},
{
  returnDocument: "after",
  runValidators: true,
  ...options,
}


);
};

// =========================================================
// EXPORT
// =========================================================

module.exports = {
create,

findById,
findByIdInternal,
findByIdAdmin,

findByProviderReference,
findByPaymentReference,
findPendingByReference,

findByLoan,
findBySchedule,
findByUser,
findAll,

updateById,
updateStatusIfCurrent,
};
