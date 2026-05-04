// controllers/emiratesController.js
const Emirates = require("../models/Emirates");

const createEmirates = async (req, res) => {
  try {
    const { emiratesName, emiratesCode } = req.body;

    if (!emiratesName || !emiratesCode) {
      return res.status(400).json({ message: "Emirates name and code are required" });
    }

    const existing = await Emirates.findOne({
      $or: [
        { emiratesName: emiratesName.trim() },
        { emiratesCode: emiratesCode.trim().toUpperCase() },
      ],
    });

    if (existing) {
      return res.status(400).json({ message: "Emirates with this name or code already exists" });
    }

    const emirates = await Emirates.create({
      emiratesName: emiratesName.trim(),
      emiratesCode: emiratesCode.trim().toUpperCase(),
    });

    res.status(201).json(emirates);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getAllEmirates = async (req, res) => {
  try {
    const emirates = await Emirates.find().sort({ emiratesName: 1 });
    res.json(emirates);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getEmiratesById = async (req, res) => {
  try {
    const emirates = await Emirates.findById(req.params.id);
    if (!emirates) return res.status(404).json({ message: "Emirates not found" });
    res.json(emirates);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const updateEmirates = async (req, res) => {
  try {
    const { emiratesName, emiratesCode } = req.body;

    if (!emiratesName || !emiratesCode) {
      return res.status(400).json({ message: "Emirates name and code are required" });
    }

    const existing = await Emirates.findOne({
      $or: [
        { emiratesName: emiratesName.trim() },
        { emiratesCode: emiratesCode.trim().toUpperCase() },
      ],
      _id: { $ne: req.params.id },
    });

    if (existing) {
      return res.status(400).json({ message: "Emirates with this name or code already exists" });
    }

    const emirates = await Emirates.findByIdAndUpdate(
      req.params.id,
      {
        emiratesName: emiratesName.trim(),
        emiratesCode: emiratesCode.trim().toUpperCase(),
      },
      { new: true, runValidators: true }
    );

    if (!emirates) return res.status(404).json({ message: "Emirates not found" });

    res.json(emirates);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const deleteEmirates = async (req, res) => {
  try {
    const emirates = await Emirates.findByIdAndDelete(req.params.id);
    if (!emirates) return res.status(404).json({ message: "Emirates not found" });
    res.json({ message: "Emirates deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createEmirates,
  getAllEmirates,
  getEmiratesById,
  updateEmirates,
  deleteEmirates,
};
