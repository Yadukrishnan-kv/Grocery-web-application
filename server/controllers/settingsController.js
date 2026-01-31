const CompanySettings = require("../models/CompanySettings");

const createCompanySettings = async (req, res) => {
  try {
    // Check if any settings already exist
    const existing = await CompanySettings.findOne();
    if (existing) {
      return res.status(400).json({
        message: "Company settings already exist. Use PUT to update instead.",
        existingId: existing._id,
      });
    }

    const {
      companyName,
      companyAddress,
      companyPhone,
      companyEmail,
      bankName,
      bankAccountNumber,
    } = req.body;

    if (!companyName || !companyAddress) {
      return res
        .status(400)
        .json({ message: "Company name and address are required" });
    }

    const settings = await CompanySettings.create({
      companyName,
      companyAddress,
      companyPhone,
      companyEmail,
      bankName,
      bankAccountNumber,
      updatedBy: req.user._id,
    });

    res.status(201).json({
      message: "Company settings created successfully",
      settings,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
// Get current company settings
const getCompanySettings = async (req, res) => {
  try {
    const settings = await CompanySettings.findOne();
    if (!settings) {
      return res.status(200).json(null); // No settings yet
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Create or Update company settings (upsert)
const updateCompanySettings = async (req, res) => {
  try {
    const {
      companyName,
      companyAddress,
      companyPhone,
      companyEmail,
      bankName,
      bankAccountNumber,
    } = req.body;

    if (!companyName || !companyAddress) {
      return res
        .status(400)
        .json({ message: "Company name and address are required" });
    }

    const settings = await CompanySettings.findByIdAndUpdate(
      req.params.id,
      {
        companyName,
        companyAddress,
        companyPhone,
        companyEmail,
        bankName,
        bankAccountNumber,
        updatedBy: req.user._id,
      },
      { new: true, runValidators: true },
    );

    if (!settings) {
      return res.status(404).json({ message: "Company settings not found" });
    }

    res.json({
      message: "Company settings updated successfully",
      settings,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  createCompanySettings,
  getCompanySettings,
  updateCompanySettings,
};
