const express = require("express");
const router = express.Router();

const {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  toggleCategoryStatus
} = require("../controllers/categoryController");


router.post("/createcategory", createCategory);
router.get("/getallcategories", getAllCategories);
router.get("/getcategorybyid/:id", getCategoryById);
router.put("/updatecategory/:id", updateCategory);
router.patch("/togglestatus/:id", toggleCategoryStatus);
router.delete("/deletecategory/:id", deleteCategory);

module.exports = router;