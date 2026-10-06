const express = require("express");
const router = express.Router();

const {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  toggleProductStatus,
  downloadProductCatalog
} = require("../controllers/productController");


router.post("/createproduct", createProduct);
router.get("/getallproducts", getAllProducts);
router.get("/download-catalog", downloadProductCatalog);
router.get("/getproductbyid/:id", getProductById);
router.put("/updateproduct/:id", updateProduct);
router.patch("/togglestatus/:id", toggleProductStatus);
router.delete("/deleteproduct/:id", deleteProduct);

module.exports = router;