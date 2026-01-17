const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  createCustomer,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,getMyCustomerProfile
} = require("../controllers/customerController");

router.use(protect); 
router.post("/createcustomer", createCustomer);
router.get("/getallcustomers", getAllCustomers);
router.get("/getcustomerbyid/:id", getCustomerById);
router.put("/updatecustomer/:id", updateCustomer);
router.delete("/deletecustomer/:id", deleteCustomer);
router.get("/my-profile", getMyCustomerProfile);

module.exports = router;