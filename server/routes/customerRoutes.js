const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  createCustomer,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  getMyCustomerProfile,
  createCustomerProfile,
  createCustomerRequest,
  getMyCustomerRequests,
  getPendingCustomerRequests,
  acceptCustomerRequest,
  rejectCustomerRequest
} = require("../controllers/customerController");

router.use(protect); 
router.post("/createcustomer", createCustomer);
router.get("/getallcustomers", getAllCustomers);
router.get("/getcustomerbyid/:id", getCustomerById);
router.put("/updatecustomer/:id", updateCustomer);
router.delete("/deletecustomer/:id", deleteCustomer);
router.get("/my-profile", getMyCustomerProfile);
router.post("/createprofile", createCustomerProfile);
router.post("/customer-requests/create", protect, createCustomerRequest);
router.get("/customer-requests/my-requests", protect, getMyCustomerRequests);
router.get("/customer-requests/pending", protect, getPendingCustomerRequests);
router.post("/customer-requests/accept/:id", protect, acceptCustomerRequest);
router.post("/customer-requests/reject/:id", protect, rejectCustomerRequest);

module.exports = router;