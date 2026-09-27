const AdminUserService =
  require(
    "../services/AdminUserService"
  );

// =========================================================
// GET USERS
// =========================================================

const getUsers = async (
  req,
  res,
  next
) => {
  try {
    const {
      search,
      page,
      limit,
      isVerified,
      isAdmin,
    } = req.query;

    const result =
      await AdminUserService.getUsers({
        search,
        page,
        limit,

        isVerified:
          isVerified === undefined
            ? undefined
            : isVerified === "true",

        isAdmin:
          isAdmin === undefined
            ? undefined
            : isAdmin === "true",
      });

    return res.status(200).json({
      success: true,
      data: result.users,
      pagination:
        result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET USER
// =========================================================

const getUser = async (
  req,
  res,
  next
) => {
  try {
    const user =
      await AdminUserService.getUser(
        req.params.id
      );

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// VERIFY
// =========================================================

const setVerification = async (
  req,
  res,
  next
) => {
  try {
    const {
      isVerified,
    } = req.body;

    if (
      typeof isVerified !==
      "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "isVerified must be boolean",
      });
    }

    const user =
      await AdminUserService.setVerification(
        req.user._id,
        req.params.id,
        isVerified
      );

    return res.status(200).json({
      success: true,
      message:
        isVerified
          ? "User verified"
          : "User verification revoked",
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// ADMIN STATUS
// =========================================================

const setAdminStatus = async (
  req,
  res,
  next
) => {
  try {
    const {
      isAdmin,
    } = req.body;

    if (
      typeof isAdmin !==
      "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "isAdmin must be boolean",
      });
    }

    const user =
      await AdminUserService.setAdminStatus(
        req.user._id,
        req.params.id,
        isAdmin
      );

    return res.status(200).json({
      success: true,
      message:
        isAdmin
          ? "Admin access granted"
          : "Admin access revoked",
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// ONLINE STATUS
// =========================================================

const setOnlineStatus = async (
  req,
  res,
  next
) => {
  try {
    const {
      online,
    } = req.body;

    if (
      typeof online !==
      "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "online must be boolean",
      });
    }

    const user =
      await AdminUserService.setOnlineStatus(
        req.params.id,
        online
      );

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsers,
  getUser,
  setVerification,
  setAdminStatus,
  setOnlineStatus,
};