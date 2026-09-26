const AdminUserRepository =
  require(
    "../repositories/AdminUserRepository"
  );

// =========================================================
// GET USERS
// =========================================================

const getUsers = async (
  filters
) => {
  return AdminUserRepository.findAll(
    filters
  );
};

// =========================================================
// GET USER
// =========================================================

const getUser = async (
  userId
) => {
  const user =
    await AdminUserRepository.findById(
      userId
    );

  if (!user) {
    const error = new Error(
      "User not found"
    );

    error.statusCode = 404;

    throw error;
  }

  return user;
};

// =========================================================
// VERIFY USER
// =========================================================

const setVerification = async (
  adminId,
  userId,
  isVerified
) => {
  if (
    String(adminId) ===
    String(userId)
  ) {
    const error = new Error(
      "You cannot modify your own verification status"
    );

    error.statusCode = 400;

    throw error;
  }

  const user =
    await AdminUserRepository.findById(
      userId
    );

  if (!user) {
    const error = new Error(
      "User not found"
    );

    error.statusCode = 404;

    throw error;
  }

  return AdminUserRepository.updateById(
    userId,
    {
      isVerified:
        Boolean(isVerified),
    }
  );
};

// =========================================================
// UPDATE ADMIN STATUS
// =========================================================

const setAdminStatus = async (
  adminId,
  userId,
  isAdmin
) => {
  if (
    String(adminId) ===
    String(userId)
  ) {
    const error = new Error(
      "You cannot change your own admin status"
    );

    error.statusCode = 400;

    throw error;
  }

  const user =
    await AdminUserRepository.findById(
      userId
    );

  if (!user) {
    const error = new Error(
      "User not found"
    );

    error.statusCode = 404;

    throw error;
  }

  return AdminUserRepository.updateById(
    userId,
    {
      isAdmin:
        Boolean(isAdmin),
    }
  );
};

// =========================================================
// UPDATE ONLINE STATUS
// =========================================================

const setOnlineStatus = async (
  userId,
  online
) => {
  const user =
    await AdminUserRepository.findById(
      userId
    );

  if (!user) {
    const error = new Error(
      "User not found"
    );

    error.statusCode = 404;

    throw error;
  }

  return AdminUserRepository.updateById(
    userId,
    {
      online: Boolean(online),
      lastActive: new Date(),
    }
  );
};

module.exports = {
  getUsers,
  getUser,
  setVerification,
  setAdminStatus,
  setOnlineStatus,
};