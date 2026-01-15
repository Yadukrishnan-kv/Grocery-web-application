const express = require("express");
const router = express.Router();

const {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct
} = require("../controllers/productController");


router.post("/createproduct", createProduct);
router.get("/getallproducts", getAllProducts);
router.get("/getproductbyid/:id", getProductById);
router.put("/updateproduct/:id", updateProduct);
router.delete("/deleteproduct/:id", deleteProduct);

module.exports = router;