const express = require("express");
const router = express.Router();

const {
  createSubCategory,
  getAllSubCategories,
  getSubCategoryById,
  getSubCategoriesByCategory,
  updateSubCategory,
  deleteSubCategory,
  toggleSubCategoryStatus
} = require("../controllers/subCategoryController");


router.post("/createsubcategory", createSubCategory);
router.get("/getallsubcategories", getAllSubCategories);
router.get("/getsubcategorybyid/:id", getSubCategoryById);
router.get("/getsubcategoriesbycategory/:categoryName", getSubCategoriesByCategory);
router.put("/updatesubcategory/:id", updateSubCategory);
router.patch("/togglestatus/:id", toggleSubCategoryStatus);
router.delete("/deletesubcategory/:id", deleteSubCategory);

module.exports = router;