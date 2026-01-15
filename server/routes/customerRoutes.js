const express = require("express");
const router = express.Router();

const {
  createCustomer,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer
} = require("../controllers/customerController");


router.post("/createcustomer", createCustomer);
router.get("/getallcustomers", getAllCustomers);
router.get("/getcustomerbyid/:id", getCustomerById);
router.put("/updatecustomer/:id", updateCustomer);
router.delete("/deletecustomer/:id", deleteCustomer);

module.exports = router;