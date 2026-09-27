const AdminBorrowerService =
  require(
    "../services/AdminBorrowerService"
  );

// =========================================================
// BORROWER 360
// =========================================================

const getBorrower360 = async (
  req,
  res,
  next
) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Not authorized",
      });
    }

    const { userId } =
      req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message:
          "User ID is required",
      });
    }

    const result =
      await AdminBorrowerService.getBorrower360(
        userId
      );

    return res.status(200).json({
      success: true,
      message:
        "Borrower information retrieved successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBorrower360,
};