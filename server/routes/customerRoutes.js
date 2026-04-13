const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  createCustomer,
  getAllCustomers,
  getCustomerById,
  getSalesmanCustomers,
  updateCustomer,
  deleteCustomer,
  getMyCustomerProfile,
  createCustomerProfile,
  createCustomerRequest,
  getMyCustomerRequests,
  getPendingCustomerRequests,
  acceptCustomerRequest,
  rejectCustomerRequest,
  getAllCustomersWithDue,
  getMyCustomers,
  getMyCustomersWithDue,
  getCustomerOutstandingDetails,
  getCustomerReceipts,
  getPendingRequestsForManager,
  suggestCreditLimit,
  updateSuggestionStatus
} = require("../controllers/customerController");

router.use(protect); 
router.post("/createcustomer", createCustomer);
router.get("/getallcustomers", getAllCustomers);
router.get("/getcustomerbyid/:id", getCustomerById);
router.get("/salesman-customers",  getSalesmanCustomers);
router.put("/updatecustomer/:id", updateCustomer);
router.delete("/deletecustomer/:id", deleteCustomer);
router.get("/my-profile", getMyCustomerProfile);
router.post("/createprofile", createCustomerProfile);
router.post("/customer-requests/create", protect, createCustomerRequest);
router.get("/customer-requests/my-requests", protect, getMyCustomerRequests);
router.get("/customer-requests/pending", protect, getPendingCustomerRequests);
router.post("/customer-requests/accept/:id", protect, acceptCustomerRequest);
router.post("/customer-requests/reject/:id", protect, rejectCustomerRequest);
router.get('/getallcustomerswithdue', protect, getAllCustomersWithDue);
router.get('/my-customers', protect, getMyCustomers);
router.get('/my-customers-with-due', protect, getMyCustomersWithDue);
router.get('/outstanding/:customerId', protect, getCustomerOutstandingDetails);
router.get('/receipts', protect, getCustomerReceipts);
router.get('/customer-requests/manager-pending', protect, getPendingRequestsForManager);
router.post('/customer-requests/suggest-credit/:id', protect, suggestCreditLimit);
router.post('/customer-requests/update-suggestion/:id', protect, updateSuggestionStatus);

module.exports = router;