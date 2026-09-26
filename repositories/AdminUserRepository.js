const User = require("../model/UserModel");

// =========================================================
// FIND USERS
// =========================================================

const findAll = async ({
  search,
  isVerified,
  isAdmin,
  page = 1,
  limit = 20,
}) => {
  const query = {};

  if (search) {
    query.$or = [
      {
        name: {
          $regex: search,
          $options: "i",
        },
      },
      {
        email: {
          $regex: search,
          $options: "i",
        },
      },
      {
        phone: {
          $regex: search,
          $options: "i",
        },
      },
    ];
  }

  if (typeof isVerified === "boolean") {
    query.isVerified = isVerified;
  }

  if (typeof isAdmin === "boolean") {
    query.isAdmin = isAdmin;
  }

  const currentPage = Math.max(
    Number(page) || 1,
    1
  );

  const currentLimit = Math.min(
    Math.max(Number(limit) || 20, 1),
    100
  );

  const [users, total] =
    await Promise.all([
      User.find(query)
        .select(
          "-password " +
          "-resetPasswordToken " +
          "-phoneVerificationToken"
        )
        .sort({
          createdAt: -1,
        })
        .skip(
          (currentPage - 1) *
            currentLimit
        )
        .limit(currentLimit),

      User.countDocuments(query),
    ]);

  return {
    users,
    pagination: {
      page: currentPage,
      limit: currentLimit,
      total,
      pages: Math.ceil(
        total / currentLimit
      ),
    },
  };
};

// =========================================================
// FIND ONE
// =========================================================

const findById = async (userId) => {
  return User.findById(userId).select(
    "-password " +
    "-resetPasswordToken " +
    "-phoneVerificationToken"
  );
};

// =========================================================
// UPDATE
// =========================================================

const updateById = async (
  userId,
  update
) => {
  return User.findByIdAndUpdate(
    userId,
    {
      $set: update,
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  ).select(
    "-password " +
    "-resetPasswordToken " +
    "-phoneVerificationToken"
  );
};

module.exports = {
  findAll,
  findById,
  updateById,
};