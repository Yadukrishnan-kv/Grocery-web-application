// src/pages/Delivery/DeliveredOrdersList.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import toast from "react-hot-toast"; // ← NEW IMPORT

import "./DeliveredOrdersList.css";
import axios from "axios";

const DeliveredOrdersList = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Delivered Orders");
  const [user, setUser] = useState(null);
  const [deliveringOrderId, setDeliveringOrderId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [currentOrderInfo, setCurrentOrderInfo] = useState(null);
  const [quantity, setQuantity] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("credit");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [chequeDate, setChequeDate] = useState("");

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fractionalUnits = ["kg", "gram", "liter", "ml", "meter", "cm", "inch"];

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        window.location.href = "/login";
        return;
      }
      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data.user || response.data);
    } catch (error) {
      console.error("Failed to load user", error);
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }, [backendUrl]);

  const fetchAllAcceptedOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/orders/my-assigned-orders`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const acceptedOrders = response.data.filter(
        (order) => order.assignmentStatus === "accepted"
      );
      setOrders(acceptedOrders);
    } catch (error) {
      console.error("Error fetching accepted orders:", error);
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchAllAcceptedOrders();
  }, [fetchCurrentUser, fetchAllAcceptedOrders]);

  const openDeliveryModal = (orderId, orderedQuantity, deliveredQuantity, unit, price, totalAmount) => {
    const remaining = orderedQuantity - deliveredQuantity;
    const allowDecimal = fractionalUnits.includes(unit?.toLowerCase());

    setCurrentOrderInfo({
      orderId,
      orderedQuantity,
      deliveredQuantity,
      unit,
      price,
      totalAmount,
      remaining,
      allowDecimal,
    });

    setQuantity("");
    setPaymentMethod("credit");
    setChequeNumber("");
    setChequeBank("");
    setChequeDate("");
    setCurrentStep(1);
    setShowDeliveryModal(true);
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (!quantity || isNaN(quantity) || quantity <= 0 || quantity > currentOrderInfo.remaining) {
        toast.error(
          `Please enter a valid quantity (max ${currentOrderInfo.remaining.toFixed(
            currentOrderInfo.allowDecimal ? 2 : 0
          )} ${currentOrderInfo.unit || ""})`
        );
        return;
      }

      if (!currentOrderInfo.allowDecimal && !Number.isInteger(Number(quantity))) {
        toast.error(`For ${currentOrderInfo.unit} units, only whole numbers are allowed.`);
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (paymentMethod === "cheque") {
        setCurrentStep(3);
      } else {
        proceedWithDelivery();
      }
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const proceedWithDelivery = async () => {
    let chequeDetails = null;
    if (paymentMethod === "cheque") {
      if (!chequeNumber.trim() || !chequeBank.trim() || !chequeDate) {
        toast.error("Please fill all cheque details: number, bank, and date.");
        return;
      }
      chequeDetails = {
        number: chequeNumber.trim(),
        bank: chequeBank.trim(),
        date: chequeDate,
      };
    }

    setShowDeliveryModal(false);
    setDeliveringOrderId(currentOrderInfo.orderId);

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/orders/deliverorder/${currentOrderInfo.orderId}`,
        {
          quantity: Number(quantity),
          paymentMethod,
          chequeDetails,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // SUCCESS TOASTS (replaced alert)
      if (paymentMethod === "credit") {
        toast.success("Order delivered successfully (credit used).");
      } else if (paymentMethod === "cash") {
        toast.success("Order delivered. Cash received added to your wallet.");
      } else {
        toast.success("Order delivered. Cheque received added to your wallet.");
      }

      fetchAllAcceptedOrders();
    } catch (error) {
      console.error("Error delivering order:", error);
      toast.error(error.response?.data?.message || "Failed to deliver order. Please try again.");
    } finally {
      setDeliveringOrderId(null);
      setCurrentOrderInfo(null);
    }
  };

  const getDeliveryStatus = (order) => {
    if (order.deliveredQuantity === 0) return "Not Delivered";
    if (order.deliveredQuantity < order.orderedQuantity) return "Partially Delivered";
    return "Fully Delivered";
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        !searchTerm.trim() ||
        order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === "all" ||
        getDeliveryStatus(order).toLowerCase().replace(" ", "-") === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);

  const clearSearch = () => {
    setSearchTerm("");
  };

  if (!user) {
    return <div className="delivered-orders-loading">Loading...</div>;
  }

  return (
    <div className="delivered-orders-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={user}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem={activeItem}
        onSetActiveItem={setActiveItem}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main
        className={`delivered-orders-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="delivered-orders-container-wrapper">
          <div className="delivered-orders-container">
            <h2 className="delivered-orders-page-title">Deliver Orders</h2>

            <div className="delivered-orders-controls-group">
              <div className="delivered-orders-filter-group">
                <label htmlFor="statusFilter" className="delivered-orders-filter-label">
                  Filter by Status:
                </label>
                <select
                  id="statusFilter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="delivered-orders-status-filter"
                >
                  <option value="all">All Statuses</option>
                  <option value="not-delivered">Not Delivered</option>
                  <option value="partially-delivered">Partially Delivered</option>
                  <option value="fully-delivered">Fully Delivered</option>
                </select>
              </div>

              <div className="delivered-orders-search-container">
                <input
                  type="text"
                  className="delivered-orders-search-input"
                  placeholder="Search by customer name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="Search orders by customer name"
                />
                {searchTerm && (
                  <button
                    className="delivered-orders-search-clear"
                    onClick={clearSearch}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="delivered-orders-loading">Loading orders...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="delivered-orders-no-data">
                No orders found
                {statusFilter !== "all" ? ` with status "${statusFilter.replace("-", " ")}"` : ""}
                {searchTerm.trim() ? ` matching "${searchTerm}"` : ""}
              </div>
            ) : (
              <div className="delivered-orders-table-wrapper">
                <table className="delivered-orders-data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Product</th>
                      <th scope="col">Ordered Qty</th>
                      <th scope="col">Delivered Qty</th>
                      <th scope="col">Remaining Qty</th>
                      <th scope="col">Price</th>
                      <th scope="col">Total Amount</th>
                      <th scope="col">Remarks</th>
                      <th scope="col">Delivery Status</th>
                      <th scope="col">Order Date</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order, index) => (
                      <tr key={order._id}>
                        <td>{index + 1}</td>
                        <td>{order.customer?.name || "N/A"}</td>
                        <td>{order.product?.productName || "N/A"}</td>
                        <td>{order.orderedQuantity} {order.unit || ""}</td>
                        <td>{order.deliveredQuantity} {order.unit || ""}</td>
                        <td>
                          {(order.orderedQuantity - order.deliveredQuantity).toFixed(2)}{" "}
                          {order.unit || ""}
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <img
                              src={DirhamSymbol}
                              alt="Dirham Symbol"
                              width={18}
                              height={20}
                              style={{ paddingTop: "2px" }}
                            />
                            <span>{order.price.toFixed(2)}</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <img
                              src={DirhamSymbol}
                              alt="Dirham Symbol"
                                 width={18}
                              height={20}
                              style={{ paddingTop: "2px" }}
                            />
                            <span>{order.totalAmount.toFixed(2)}</span>
                          </div>
                        </td>
                        <td>{order.remarks || "-"}</td>
                        <td>
                          <span
                            className={`delivered-orders-status-badge delivered-orders-status-${getDeliveryStatus(order).toLowerCase().replace(" ", "-")}`}
                          >
                            {getDeliveryStatus(order)}
                          </span>
                        </td>
                        <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                        <td>
                          {order.deliveredQuantity < order.orderedQuantity ? (
                            <button
                              className="delivered-orders-deliver-button"
                              onClick={() =>
                                openDeliveryModal(
                                  order._id,
                                  order.orderedQuantity,
                                  order.deliveredQuantity,
                                  order.unit,
                                  order.price,
                                  order.totalAmount
                                )
                              }
                              disabled={deliveringOrderId === order._id}
                            >
                              {deliveringOrderId === order._id ? "Delivering..." : "Deliver"}
                            </button>
                          ) : (
                            <span className="delivered-orders-delivered-text">Completed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Delivery Modal with Steps (NO STEP TITLE) */}
        {showDeliveryModal && currentOrderInfo && (
          <div className="delivery-modal-overlay">
            <div className="delivery-modal">
              {currentStep === 1 && (
                <div className="modal-section">
                  <label className="modal-label">
                    Quantity to Deliver (Max: {currentOrderInfo.remaining.toFixed(currentOrderInfo.allowDecimal ? 2 : 0)} {currentOrderInfo.unit || ""})
                  </label>
                  <input
                    type="number"
                    className="modal-input"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="Enter quantity"
                    step={currentOrderInfo.allowDecimal ? "0.01" : "1"}
                    min="0.01"
                    max={currentOrderInfo.remaining}
                    required
                  />
                </div>
              )}

              {currentStep === 2 && (
                <div className="modal-section">
                  <label className="modal-label">Payment Method</label>
                  <div className="radio-group">
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="credit"
                        checked={paymentMethod === "credit"}
                        onChange={() => setPaymentMethod("credit")}
                      />
                      <span>Credit</span>
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="cash"
                        checked={paymentMethod === "cash"}
                        onChange={() => setPaymentMethod("cash")}
                      />
                      <span>Cash</span>
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="cheque"
                        checked={paymentMethod === "cheque"}
                        onChange={() => setPaymentMethod("cheque")}
                      />
                      <span>Cheque</span>
                    </label>
                  </div>
                </div>
              )}

              {currentStep === 3 && paymentMethod === "cheque" && (
                <div className="modal-section cheque-section">
                  <h3 className="cheque-title">Cheque Details</h3>
                  <label className="modal-label">Cheque Number</label>
                  <input
                    type="text"
                    className="modal-input"
                    value={chequeNumber}
                    onChange={(e) => setChequeNumber(e.target.value)}
                    placeholder="e.g. 123456789"
                    required
                  />

                  <label className="modal-label">Bank Name</label>
                  <input
                    type="text"
                    className="modal-input"
                    value={chequeBank}
                    onChange={(e) => setChequeBank(e.target.value)}
                    placeholder="e.g. Emirates NBD"
                    required
                  />

                  <label className="modal-label">Cheque Date</label>
                  <input
                    type="date"
                    className="modal-input"
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="modal-actions">
                {currentStep > 1 && (
                  <button className="modal-back-btn" onClick={handlePreviousStep}>
                    Back
                  </button>
                )}
                <button className="modal-cancel-btn" onClick={() => setShowDeliveryModal(false)}>
                  Cancel
                </button>
                <button
                  className="modal-next-btn"
                  onClick={handleNextStep}
                  disabled={currentStep === 1 && !quantity}
                >
                  {currentStep === (paymentMethod === "cheque" ? 3 : 2) ? "Submit & Deliver" : "Next"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default DeliveredOrdersList;