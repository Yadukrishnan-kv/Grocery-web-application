const SubCategory = require("../models/SubCategory");

const createSubCategory = async (req, res) => {
  try {
    const { CategoryName, subCategoryName } = req.body;

    const existing = await SubCategory.findOne({ CategoryName, subCategoryName });
    if (existing) {
      return res.status(400).json({ 
        message: "Sub-category already exists in this category" 
      });
    }

    const subCategory = await SubCategory.create({ CategoryName, subCategoryName });
    res.status(201).json(subCategory);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAllSubCategories = async (req, res) => {
  try {
    const subCategories = await SubCategory.find()
      .sort({ CategoryName: 1, subCategoryName: 1 });
    res.json(subCategories);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getSubCategoryById = async (req, res) => {
  try {
    const subCategory = await SubCategory.findById(req.params.id);
    if (!subCategory) {
      return res.status(404).json({ message: "Sub-category not found" });
    }
    res.json(subCategory);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getSubCategoriesByCategory = async (req, res) => {
  try {
    const { categoryName } = req.params;
    const subCategories = await SubCategory.find({ CategoryName: categoryName })
      .sort({ subCategoryName: 1 });
    res.json(subCategories);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const updateSubCategory = async (req, res) => {
  try {
    const { CategoryName, subCategoryName } = req.body;
    const updateData = {};

    if (CategoryName) updateData.CategoryName = CategoryName;
    if (subCategoryName) updateData.subCategoryName = subCategoryName;

    // Check for duplicate if changing name
    if (subCategoryName || CategoryName) {
      const query = { 
        CategoryName: CategoryName || { $exists: true },
        subCategoryName: subCategoryName || { $exists: true },
        _id: { $ne: req.params.id }
      };
      const existing = await SubCategory.findOne(query);
      if (existing) {
        return res.status(400).json({ 
          message: "This sub-category name already exists in the category" 
        });
      }
    }

    const subCategory = await SubCategory.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!subCategory) {
      return res.status(404).json({ message: "Sub-category not found" });
    }

    res.json(subCategory);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const deleteSubCategory = async (req, res) => {
  try {
    const subCategory = await SubCategory.findByIdAndDelete(req.params.id);
    if (!subCategory) {
      return res.status(404).json({ message: "Sub-category not found" });
    }
    res.json({ message: "Sub-category deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createSubCategory,
  getAllSubCategories,
  getSubCategoryById,
  getSubCategoriesByCategory,
  updateSubCategory,
  deleteSubCategory
};