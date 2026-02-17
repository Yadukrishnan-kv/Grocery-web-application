// src/pages/Delivery/DeliveredOrdersList.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import toast from "react-hot-toast";
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
  const [currentOrder, setCurrentOrder] = useState(null);
  const [deliveryInputs, setDeliveryInputs] = useState({}); // { productSubdocId: quantity }
  const [paymentMethod, setPaymentMethod] = useState("credit");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [chequeDate, setChequeDate] = useState("");

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const fractionalUnits = ["kg", "gram", "liter", "ml", "meter", "cm", "inch"];

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return window.location.href = "/login";
      const res = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(res.data.user || res.data);
    } catch (err) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }, [backendUrl]);

  const fetchAcceptedOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${backendUrl}/api/orders/my-assigned-orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(res.data.filter(o => o.assignmentStatus === "accepted"));
    } catch (err) {
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchAcceptedOrders();
  }, [fetchCurrentUser, fetchAcceptedOrders]);

  // Open modal and initialize inputs for each product
  const openDeliveryModal = (order) => {
    const inputs = {};
    order.orderItems.forEach(item => {
      inputs[item._id] = ""; // use subdocument _id as key
    });

    setCurrentOrder(order);
    setDeliveryInputs(inputs);
    setPaymentMethod("credit");
    setChequeNumber("");
    setChequeBank("");
    setChequeDate("");
    setShowDeliveryModal(true);
  };

  const handleQuantityChange = (productSubId, value) => {
    // Allow empty string (to clear input)
    if (value === "" || (!isNaN(value) && Number(value) >= 0)) {
      setDeliveryInputs(prev => ({ ...prev, [productSubId]: value }));
    }
  };

  const getProductRemaining = (item) => {
    const inputQty = Number(deliveryInputs[item._id] || 0);
    return item.orderedQuantity - item.deliveredQuantity - inputQty;
  };

  const validateDelivery = () => {
    for (const item of currentOrder.orderItems) {
      const qty = Number(deliveryInputs[item._id] || 0);
      const max = item.orderedQuantity - item.deliveredQuantity;

      if (qty > max) {
        return `Cannot deliver more than remaining (${max} ${item.unit || ""}) for ${item.product?.productName || "product"}`;
      }
      if (qty < 0 || (qty > 0 && isNaN(qty))) {
        return "Invalid quantity entered";
      }
    }
    return null;
  };

  const proceedWithDelivery = async () => {
    const error = validateDelivery();
    if (error) return toast.error(error);

    // Prepare delivered items (only those with quantity > 0)
    const deliveredItems = currentOrder.orderItems
      .map(item => {
        const qty = Number(deliveryInputs[item._id] || 0);
        return qty > 0 ? { product: item._id, quantity: qty } : null;
      })
      .filter(Boolean);

    if (deliveredItems.length === 0) {
      return toast.error("Please enter quantity for at least one product");
    }

    let chequeDetails = null;
    if (paymentMethod === "cheque") {
      if (!chequeNumber.trim() || !chequeBank.trim() || !chequeDate) {
        return toast.error("Please fill all cheque details");
      }
      chequeDetails = {
        number: chequeNumber.trim(),
        bank: chequeBank.trim(),
        date: chequeDate,
      };
    }

    setShowDeliveryModal(false);
    setDeliveringOrderId(currentOrder._id);

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/orders/deliverorder/${currentOrder._id}`,
        {
          deliveredItems,
          deliveredAt: new Date().toISOString(),
          paymentMethod,
          chequeDetails,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Delivery recorded successfully!");
      fetchAcceptedOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to record delivery");
    } finally {
      setDeliveringOrderId(null);
      setCurrentOrder(null);
    }
  };

  const getDeliveryStatus = (order) => {
    const totalOrdered = order.orderItems?.reduce((s, i) => s + i.orderedQuantity, 0) || 0;
    const totalDelivered = order.orderItems?.reduce((s, i) => s + i.deliveredQuantity, 0) || 0;

    if (totalDelivered === 0) return "Not Delivered";
    if (totalDelivered < totalOrdered) return "Partially Delivered";
    return "Fully Delivered";
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = !searchTerm.trim() ||
        order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" ||
        getDeliveryStatus(order).toLowerCase().replace(" ", "-") === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  if (!user) return <div className="delivered-orders-loading">Loading...</div>;

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
      <main className={`delivered-orders-main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
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
                  onChange={e => setStatusFilter(e.target.value)}
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
                  onChange={e => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button className="delivered-orders-search-clear" onClick={() => setSearchTerm("")}>
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
                {statusFilter !== "all" && ` with status "${statusFilter.replace("-", " ")}"`}
                {searchTerm.trim() && ` matching "${searchTerm}"`}
              </div>
            ) : (
              <div className="delivered-orders-table-wrapper">
                <table className="delivered-orders-data-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Customer</th>
                      <th>Products</th>
                      <th>Total Ordered</th>
                      <th>Total Delivered</th>
                      <th>Remaining</th>
                      <th>Grand Total</th>
                      <th>Remarks</th>
                      <th>Status</th>
                      <th>Order Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order, index) => {
                      const totalOrdered = order.orderItems?.reduce((s, i) => s + i.orderedQuantity, 0) || 0;
                      const totalDelivered = order.orderItems?.reduce((s, i) => s + i.deliveredQuantity, 0) || 0;
                      const remaining = totalOrdered - totalDelivered;
                      const grandTotal = order.orderItems?.reduce((s, i) => s + i.totalAmount, 0)?.toFixed(2) || "0.00";

                      return (
                        <tr key={order._id}>
                          <td>{index + 1}</td>
                          <td>{order.customer?.name || "N/A"}</td>

                          <td className="products-cell">
                            {order.orderItems?.length > 0 ? (
                              <div className="products-list">
                                {order.orderItems.map((item, i) => (
                                  <div key={i} className="product-tag">
                                    <span className="product-name">{item.product?.productName || "—"}</span>
                                    <span className="product-qty">× {item.orderedQuantity}</span>
                                    <span className="product-unit">{item.unit || ""}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="no-products">No products</span>
                            )}
                          </td>

                          <td>{totalOrdered}</td>
                          <td>{totalDelivered}</td>
                          <td>{remaining}</td>

                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <img src={DirhamSymbol} alt="AED" width={18} height={20} style={{ paddingTop: "2px" }} />
                              <span>{grandTotal}</span>
                            </div>
                          </td>

                          <td>{order.remarks || "—"}</td>

                          <td>
                            <span className={`status-badge status-${getDeliveryStatus(order).toLowerCase().replace(" ", "-")}`}>
                              {getDeliveryStatus(order)}
                            </span>
                          </td>

                          <td>{formatDate(order.orderDate)}</td>

                          <td>
                            {remaining > 0 ? (
                              <button
                                className="deliver-btn"
                                onClick={() => openDeliveryModal(order)}
                                disabled={deliveringOrderId === order._id}
                              >
                                {deliveringOrderId === order._id ? "Delivering..." : "Deliver"}
                              </button>
                            ) : (
                              <span className="completed-text">Completed</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ────────────────────────────────────────────────
            Per-Product Delivery Modal
        ──────────────────────────────────────────────── */}
        {showDeliveryModal && currentOrder && (
          <div className="delivery-modal-overlay">
            <div className="delivery-modal">
              <h3>Deliver Order #{currentOrder._id.toString().slice(-8)}</h3>

             <div className="products-delivery-list">
  {currentOrder.orderItems.map(item => {
    const remaining = getProductRemaining(item); 

    return (
      <div key={item._id} className="product-delivery-row">
        <div className="product-info">
          <strong>{item.product?.productName || "Unknown Product"}</strong>
          <div>Ordered: {item.orderedQuantity} {item.unit || ""}</div>
          <div>Already Delivered: {item.deliveredQuantity} {item.unit || ""}</div>
        </div>

        <div className="quantity-input-group">
          <label>Deliver Now:</label>
          <input
            type="number"
            min="0"
            max={item.orderedQuantity - item.deliveredQuantity}
            step={fractionalUnits.includes(item.unit?.toLowerCase()) ? "0.01" : "1"}
            value={deliveryInputs[item._id] || ""}
            onChange={e => handleQuantityChange(item._id, e.target.value)}
            placeholder="0"
          />
          <span className={`remaining-text ${remaining < 0 ? "negative" : ""}`}>
            Remaining: {remaining >= 0 ? remaining : "Over-delivered!"}
            {item.unit ? ` ${item.unit}` : ""}
          </span>
        </div>
      </div>
    );
  })}
</div>

              {/* Payment Method */}
              <div className="payment-section">
                <label>Payment Method</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  <option value="credit">Credit</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>

              {/* Cheque Details */}
              {paymentMethod === "cheque" && (
                <div className="cheque-details">
                  <input
                    placeholder="Cheque Number"
                    value={chequeNumber}
                    onChange={e => setChequeNumber(e.target.value)}
                  />
                  <input
                    placeholder="Bank Name"
                    value={chequeBank}
                    onChange={e => setChequeBank(e.target.value)}
                  />
                  <input
                    type="date"
                    value={chequeDate}
                    onChange={e => setChequeDate(e.target.value)}
                  />
                </div>
              )}

              <div className="modal-actions">
                <button className="cancel-btn" onClick={() => setShowDeliveryModal(false)}>
                  Cancel
                </button>
                <button
                  className="submit-btn"
                  onClick={proceedWithDelivery}
                  disabled={deliveringOrderId === currentOrder._id}
                >
                  {deliveringOrderId === currentOrder._id ? "Submitting..." : "Confirm Delivery"}
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