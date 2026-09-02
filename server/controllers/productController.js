// controllers/productController.js (no change needed)
const Product = require("../models/Product");
const { getPaginationParams, buildPaginatedResponse } = require("../utils/paginate");

const createProduct = async (req, res) => {
  try {
    const { productName, CategoryName, subCategoryName, price, quantity, unit } = req.body;

    const product = await Product.create({
      productName,
      CategoryName,
      subCategoryName,
      price,
      quantity,
      unit
    });

    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAllProducts = async (req, res) => {
  try {
    const sort = { CategoryName: 1, subCategoryName: 1, productName: 1 };

    if (!req.query.page) {
      const products = await Product.find().sort(sort);
      return res.json(products);
    }

    const { page, limit, skip } = getPaginationParams(req.query);
    const [products, totalRecords] = await Promise.all([
      Product.find().sort(sort).skip(skip).limit(limit),
      Product.countDocuments(),
    ]);
    res.json(buildPaginatedResponse(products, totalRecords, page, limit));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const updateProduct = async (req, res) => {
  try {
    const updateData = {};
    const allowedFields = ["productName", "CategoryName", "subCategoryName", "price", "quantity", "unit"];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct
};