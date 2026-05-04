// src/pages/SalesReturn/CreateSalesReturn.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../../components/layout/Header/Header";
import Sidebar from "../../components/layout/Sidebar/Sidebar";
import toast from "react-hot-toast";
import axios from "axios";
import "./CreateSalesReturn.css";

const CreateSalesReturn = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedOrderId = searchParams.get("orderId") || "";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [deliveredOrders, setDeliveredOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [returnItems, setReturnItems] = useState({}); // { productId: { qty: '', reason: '' } }
  const [returnReason, setReturnReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fetchUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) { window.location.href = "/login"; return; }
      const res = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(res.data.user || res.data);
    } catch {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }, [backendUrl]);

  const fetchDeliveredOrders = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${backendUrl}/api/sales-returns/delivered-orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeliveredOrders(res.data);

      // Auto-select if orderId was passed in URL
      if (preselectedOrderId) {
        const found = res.data.find((o) => o._id === preselectedOrderId);
        if (found) {
          setSelectedOrderId(preselectedOrderId);
          setSelectedOrder(found);
          const init = {};
          (found.orderItems || []).forEach((item) => {
            if ((item.deliveredQuantity || 0) > 0) {
              init[item.product._id] = { qty: "", reason: "" };
            }
          });
          setReturnItems(init);
        }
      }
    } catch {
      toast.error("Failed to load delivered orders");
    } finally {
      setLoadingOrders(false);
    }
  }, [backendUrl, preselectedOrderId]);

  useEffect(() => {
    fetchUser();
    fetchDeliveredOrders();
  }, [fetchUser, fetchDeliveredOrders]);

  const handleOrderSelect = (orderId) => {
    setSelectedOrderId(orderId);
    if (!orderId) {
      setSelectedOrder(null);
      setReturnItems({});
      return;
    }
    const order = deliveredOrders.find((o) => o._id === orderId);
    setSelectedOrder(order || null);
    // Init return items with qty = '' for each delivered item
    const init = {};
    (order?.orderItems || []).forEach((item) => {
      if ((item.deliveredQuantity || 0) > 0) {
        init[item.product._id] = { qty: "", reason: "" };
      }
    });
    setReturnItems(init);
  };

  const handleItemChange = (productId, field, value) => {
    setReturnItems((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], [field]: value },
    }));
  };

  const getDeliveredItems = () =>
    (selectedOrder?.orderItems || []).filter((i) => (i.deliveredQuantity || 0) > 0);

  const calcTotal = () =>
    getDeliveredItems().reduce((sum, item) => {
      const qty = parseInt(returnItems[item.product._id]?.qty) || 0;
      const exclVat = qty * item.price;
      const vat = (exclVat * (item.vatPercentage || 5)) / 100;
      return sum + exclVat + vat;
    }, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOrderId) {
      toast.error("Please select an order");
      return;
    }

    const itemsToReturn = getDeliveredItems()
      .map((item) => ({
        productId: item.product._id,
        returnedQuantity: parseInt(returnItems[item.product._id]?.qty) || 0,
        reason: returnItems[item.product._id]?.reason || "",
      }))
      .filter((i) => i.returnedQuantity > 0);

    if (itemsToReturn.length === 0) {
      toast.error("Enter at least one return quantity");
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${backendUrl}/api/sales-returns/create`,
        { orderId: selectedOrderId, returnItems: itemsToReturn, returnReason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success("Return request submitted for admin approval");
      navigate(preselectedOrderId ? "/customer/orders" : "/sales-returns");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create return");
    } finally {
      setSubmitting(false);
    }
  };

  const deliveredItems = getDeliveredItems();

  return (
    <div className="csr-layout">
      <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} user={user} />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="SalesReturn"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />

      <main className={`csr-main ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="csr-page-wrapper">

          {/* Page header */}
          <div className="csr-page-header">
            <div>
              <button
                className="csr-back-btn"
                onClick={() => navigate(preselectedOrderId ? "/customer/orders" : "/sales-returns")}
              >
                ← Back
              </button>
              <h1 className="csr-page-title">Create Sales Return</h1>
              <p className="csr-page-sub">Returns can only be made within 5 days of delivery</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Step 1: Select Order */}
            <div className="csr-card">
              <div className="csr-card-header">
                <h2>Step 1 — Select Delivered Order</h2>
              </div>
              <div className="csr-card-body">
                {loadingOrders ? (
                  <p className="csr-loading">Loading delivered orders...</p>
                ) : deliveredOrders.length === 0 ? (
                  <div className="csr-info-box">
                    No delivered orders within the last 5 days. Returns can only be made within 5 days of delivery.
                  </div>
                ) : (
                  <div className="csr-form-group">
                    <label>Select Order</label>
                    <select
                      className="csr-select"
                      value={selectedOrderId}
                      onChange={(e) => handleOrderSelect(e.target.value)}
                    >
                      <option value="">-- Select an order --</option>
                      {deliveredOrders.map((o) => (
                        <option key={o._id} value={o._id}>
                          {o.invoiceNumber || o._id.slice(-8)} — {o.customer?.name} —{" "}
                          {new Date(o.updatedAt).toLocaleDateString("en-GB")}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedOrder && (
                  <div className="csr-order-info">
                    <div className="csr-order-info-row">
                      <div>
                        <span>Customer</span>
                        <strong>{selectedOrder.customer?.name}</strong>
                      </div>
                      <div>
                        <span>Invoice #</span>
                        <strong>{selectedOrder.invoiceNumber || "—"}</strong>
                      </div>
                      <div>
                        <span>Order Date</span>
                        <strong>{new Date(selectedOrder.orderDate).toLocaleDateString("en-GB")}</strong>
                      </div>
                      <div>
                        <span>Payment</span>
                        <strong className="csr-capitalize">{selectedOrder.payment}</strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Select Items */}
            {selectedOrder && deliveredItems.length > 0 && (
              <div className="csr-card">
                <div className="csr-card-header">
                  <h2>Step 2 — Select Items to Return</h2>
                  <p className="csr-card-sub">Enter return quantity (max = delivered qty). Leave 0 to skip item.</p>
                </div>
                <div className="csr-card-body">
                  <div className="csr-items-table-wrap">
                    <table className="csr-items-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Unit</th>
                          <th>Delivered Qty</th>
                          <th>Return Qty</th>
                          <th>Price / Unit</th>
                          <th>Return Amount</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deliveredItems.map((item) => {
                          const productId = item.product._id;
                          const qtyVal = returnItems[productId]?.qty || "";
                          const qty = parseInt(qtyVal) || 0;
                          const exclVat = qty * item.price;
                          const vat = (exclVat * (item.vatPercentage || 5)) / 100;
                          const lineTotal = exclVat + vat;

                          return (
                            <tr key={productId} className={qty > 0 ? "csr-row-selected" : ""}>
                              <td>
                                <div className="csr-product-name">
                                  {item.product?.productName || "—"}
                                </div>
                              </td>
                              <td>{item.unit || item.product?.unit || "—"}</td>
                              <td>
                                <span className="csr-delivered-badge">
                                  {item.deliveredQuantity}
                                </span>
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  max={item.deliveredQuantity}
                                  value={qtyVal}
                                  onChange={(e) => handleItemChange(productId, "qty", e.target.value)}
                                  className="csr-qty-input"
                                  placeholder="0"
                                />
                              </td>
                              <td>AED {(item.price || 0).toFixed(2)}</td>
                              <td className={qty > 0 ? "csr-line-total" : "csr-muted"}>
                                {qty > 0 ? `AED ${lineTotal.toFixed(2)}` : "—"}
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={returnItems[productId]?.reason || ""}
                                  onChange={(e) => handleItemChange(productId, "reason", e.target.value)}
                                  className="csr-reason-input"
                                  placeholder="Reason (optional)"
                                  disabled={!qty}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {calcTotal() > 0 && (
                        <tfoot>
                          <tr>
                            <td colSpan="5" className="csr-total-label">Total Return Amount (incl. VAT)</td>
                            <td colSpan="2" className="csr-total-val">
                              AED {calcTotal().toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Return Reason */}
            {selectedOrder && (
              <div className="csr-card">
                <div className="csr-card-header">
                  <h2>Step 3 — Return Reason</h2>
                </div>
                <div className="csr-card-body">
                  <div className="csr-form-group">
                    <label>Overall Return Reason *</label>
                    <textarea
                      rows="3"
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      placeholder="e.g. Products were damaged, wrong items delivered, etc."
                      className="csr-textarea"
                      required
                    />
                  </div>

                  <div className="csr-submit-row">
                    <button
                      type="button"
                      className="csr-btn-outline"
                      onClick={() => navigate("/sales-returns")}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="csr-btn-primary"
                      disabled={submitting || !returnReason.trim()}
                    >
                      {submitting ? "Submitting..." : "Submit Return Request"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateSalesReturn;
