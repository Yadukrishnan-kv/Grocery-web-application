// src/pages/Delivery/DeliveredOrdersList.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import toast from "react-hot-toast";
import axios from "axios";
import "./DeliveredOrdersList.css";

const DeliveredOrdersList = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Delivered Orders");
  const [user, setUser] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("credit");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [chequeDate, setChequeDate] = useState("");

  const [deliveringOrderId, setDeliveringOrderId] = useState(null);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const fractionalUnits = ["kg", "gram", "liter", "ml", "meter", "cm", "inch"];

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return (window.location.href = "/login");
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
      const res = await axios.get(
        `${backendUrl}/api/orders/my-assigned-orders`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      // ✅ Show orders that are: accepted AND (partially_packed OR fully_packed)
      // Do NOT wait for ready_to_deliver - show when packing starts
      setOrders(
        res.data.filter(
          (o) =>
            o.assignmentStatus === "accepted" &&
            (o.packedStatus === "partially_packed" ||
              o.packedStatus === "fully_packed") &&
            o.status !== "delivered" &&
            o.status !== "cancelled",
        ),
      );
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

  // Open modal only if packed (partial or full)
  const openDeliveryModal = (order) => {
    // ✅ Allow delivery for BOTH partially_packed AND fully_packed orders
    if (
      order.packedStatus !== "partially_packed" &&
      order.packedStatus !== "fully_packed"
    ) {
      return toast.error("Order not packed yet. Awaiting storekeeper packing.");
    }

    setCurrentOrder(order);
    setPaymentMethod("credit");
    setChequeNumber("");
    setChequeBank("");
    setChequeDate("");
    setShowDeliveryModal(true);
  };

  const getProductToDeliver = (item) => {
    // ✅ Auto-calculate: full remaining packed qty (no input needed)
    return (item.packedQuantity || 0) - (item.deliveredQuantity || 0);
  };

  const validateDelivery = () => {
    // ✅ No qty input - just validate if there's anything to deliver
    const toDeliverItems = currentOrder.orderItems.filter(
      (item) => getProductToDeliver(item) > 0,
    );
    if (toDeliverItems.length === 0) {
      return "No packed quantity remaining to deliver";
    }

    if (paymentMethod === "cheque") {
      if (!chequeNumber.trim() || !chequeBank.trim() || !chequeDate) {
        return "Please fill all cheque details";
      }
    }

    return null;
  };

  const proceedWithDelivery = async () => {
    const error = validateDelivery();
    if (error) return toast.error(error);

    // ✅ Auto-generate deliveredItems with full remaining packed qty
    const deliveredItems = currentOrder.orderItems
      .map((item) => {
        const qty = getProductToDeliver(item);
        return qty > 0 ? { product: item._id, quantity: qty } : null;
      })
      .filter(Boolean);

    if (deliveredItems.length === 0) {
      return toast.error("No quantity to deliver");
    }

    let chequeDetails = null;
    if (paymentMethod === "cheque") {
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
        { headers: { Authorization: `Bearer ${token}` } },
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

  // ✅ Download unified invoice showing Ordered/Packed/Delivered
  const downloadUnifiedInvoice = async (orderId, invoiceNumber) => {
    try {
      const token = localStorage.getItem("token");
      const filename = invoiceNumber
        ? `invoice-${invoiceNumber}.pdf`
        : `invoice-${orderId.slice(-8)}.pdf`;

      const res = await axios.get(
        `${backendUrl}/api/orders/unified-invoice/${orderId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob",
        },
      );

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Invoice downloaded");
    } catch (err) {
      toast.error("Failed to download invoice");
    }
  };

  const getDeliveryStatus = (order) => {
    const totalOrdered =
      order.orderItems?.reduce((s, i) => s + i.orderedQuantity, 0) || 0;
    const totalDelivered =
      order.orderItems?.reduce((s, i) => s + i.deliveredQuantity, 0) || 0;
    const totalPacked =
      order.orderItems?.reduce((s, i) => s + (i.packedQuantity || 0), 0) || 0;

    // ✅ If partially_packed or fully_packed, it's ready to deliver (or being delivered)
    if (order.packedStatus === "partially_packed") {
      if (totalDelivered === 0) return "Ready to Deliver (Partial Pack)";
      if (totalDelivered < totalPacked) return "Partially Delivered";
    }

    if (order.packedStatus !== "fully_packed") return "Awaiting Packing";
    if (totalDelivered === 0) return "Ready to Deliver (Full Pack)";
    if (totalDelivered < totalOrdered) return "Partially Delivered";
    return "Fully Delivered";
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        !searchTerm.trim() ||
        order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        getDeliveryStatus(order).toLowerCase().replace(" ", "-") ===
          statusFilter;
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
      <main
        className={`delivered-orders-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="delivered-orders-container-wrapper">
          <div className="delivered-orders-container">
            <h2 className="delivered-orders-page-title">Deliver Orders</h2>

            <div className="delivered-orders-controls-group">
              <div className="delivered-orders-filter-group">
                <label
                  htmlFor="statusFilter"
                  className="delivered-orders-filter-label"
                >
                  Filter by Status:
                </label>
                <select
                  id="statusFilter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="delivered-orders-status-filter"
                >
                  <option value="all">All Statuses</option>
                  <option value="awaiting-packing">Awaiting Packing</option>
                  <option value="ready-to-deliver">Ready to Deliver</option>
                  <option value="not-delivered">Not Delivered</option>
                  <option value="partially-delivered">
                    Partially Delivered
                  </option>
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
                />
                {searchTerm && (
                  <button
                    className="delivered-orders-search-clear"
                    onClick={() => setSearchTerm("")}
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
                {statusFilter !== "all" &&
                  ` with status "${statusFilter.replace("-", " ")}"`}
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
                      <th>Packed Qty</th> {/* NEW */}
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
                      const totalOrdered =
                        order.orderItems?.reduce(
                          (s, i) => s + i.orderedQuantity,
                          0,
                        ) || 0;
                      const packedQty =
                        order.orderItems?.reduce(
                          (s, i) => s + (i.packedQuantity || 0),
                          0,
                        ) || 0;
                      const totalDelivered =
                        order.orderItems?.reduce(
                          (s, i) => s + i.deliveredQuantity,
                          0,
                        ) || 0;
                      const remaining = packedQty - totalDelivered;
                      const grandTotal =
                        order.orderItems
                          ?.reduce((s, i) => s + i.totalAmount, 0)
                          ?.toFixed(2) || "0.00";
                      // ✅ Enable deliver button if partially_packed OR fully_packed
                      const isPacked =
                        order.packedStatus === "partially_packed" ||
                        order.packedStatus === "fully_packed";

                      return (
                        <tr key={order._id}>
                          <td>{index + 1}</td>
                          <td>{order.customer?.name || "N/A"}</td>

                          <td className="products-cell">
                            {order.orderItems?.length > 0 ? (
                              <div className="products-list">
                                {order.orderItems.map((item, i) => (
                                  <div key={i} className="product-tag">
                                    <span className="product-name">
                                      {item.product?.productName || "—"}
                                    </span>
                                    <span className="product-qty">
                                      × {item.orderedQuantity}
                                    </span>
                                    <span className="product-unit">
                                      {item.unit || ""}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="no-products">No products</span>
                            )}
                          </td>

                          <td>{totalOrdered}</td>
                          <td>{packedQty} (packed)</td>
                          <td>{totalDelivered}</td>
                          <td>{remaining}</td>

                          <td>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <img
                                src={DirhamSymbol}
                                alt="AED"
                                width={18}
                                height={20}
                                style={{ paddingTop: "2px" }}
                              />
                              <span>{grandTotal}</span>
                            </div>
                          </td>

                          <td>{order.remarks || "—"}</td>

                          <td>
                            <span
                              className={`status-badge status-${getDeliveryStatus(order).toLowerCase().replace(/\s/g, "-")}`}
                            >
                              {getDeliveryStatus(order)}
                            </span>
                          </td>

                          <td>{formatDate(order.orderDate)}</td>

                          <td>
                            <button
                              className="invoice-btn"
                              onClick={() =>
                                downloadUnifiedInvoice(
                                  order._id,
                                  order.invoiceNumber,
                                )
                              }
                            >
                              Download Invoice
                            </button>

                            {isPacked ? (
                              <button
                                className="deliver-btn"
                                onClick={() => openDeliveryModal(order)}
                                disabled={deliveringOrderId === order._id}
                              >
                                {deliveringOrderId === order._id
                                  ? "Delivering..."
                                  : "Deliver"}
                              </button>
                            ) : (
                              <span className="completed-text">
                                Awaiting Packing
                              </span>
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

        {/* Delivery Modal - Now Read-Only: Shows Details, Auto-Full Delivery */}
        {showDeliveryModal && currentOrder && (
          <div className="delivery-modal-overlay">
            <div className="delivery-modal">
              <h3>
                Confirm  Delivery 
              </h3>

             

              {/* Products List - Read-Only Display */}
              <div className="products-delivery-list">
                <h4>Packed Items to Deliver:</h4>
                {currentOrder.orderItems.map((item) => {
                  const toDeliver = getProductToDeliver(item);

                  if (toDeliver <= 0) return null; // Skip if nothing to deliver

                  return (
                    <div key={item._id} className="product-delivery-row">
                      <div className="product-info">
                        <strong>
                          {item.product?.productName || "Unknown Product"}
                        </strong>
                        <div>
                          Ordered: {item.orderedQuantity} {item.unit || ""}
                        </div>
                       
                        <div>
                          Already Delivered: {item.deliveredQuantity || 0}{" "}
                          {item.unit || ""}
                        </div>
                        <div className="to-deliver-highlight">
                          <strong>
                            To Deliver: {toDeliver} {item.unit || ""}
                          </strong>
                        </div>
                      </div>
                    
                    </div>
                  );
                })}
              </div>

              {/* Payment Section - Unchanged */}
              <div className="payment-section">
                <label>Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="credit">Credit</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>

              {paymentMethod === "cheque" && (
                <div className="cheque-details">
                  <input
                    placeholder="Cheque Number"
                    value={chequeNumber}
                    onChange={(e) => setChequeNumber(e.target.value)}
                  />
                  <input
                    placeholder="Bank Name"
                    value={chequeBank}
                    onChange={(e) => setChequeBank(e.target.value)}
                  />
                  <input
                    type="date"
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                  />
                </div>
              )}

              <div className="modal-actions">
                <button
                  className="cancel-btn"
                  onClick={() => setShowDeliveryModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="submit-btn"
                  onClick={proceedWithDelivery}
                  disabled={deliveringOrderId === currentOrder._id}
                >
                  {deliveringOrderId === currentOrder._id
                    ? "Submitting..."
                    : "Confirm  Delivery"}
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
