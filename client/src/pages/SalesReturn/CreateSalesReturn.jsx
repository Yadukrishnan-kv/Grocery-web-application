// src/pages/SalesReturn/CreateSalesReturn.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [returnItems, setReturnItems] = useState({}); // { productId: { reason: '', returnQty: 0 } }
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

  const fetchDeliveredOrders = useCallback(async (customerId = null) => {
    try {
      const token = localStorage.getItem("token");
      const url = new URL(`${backendUrl}/api/sales-returns/delivered-orders`);
      if (customerId) {
        url.searchParams.append("customerId", customerId);
      }
      const res = await axios.get(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeliveredOrders(res.data);

      // Auto-select if orderId was passed in URL
      if (preselectedOrderId) {
        const found = res.data.find((o) => o._id === preselectedOrderId);
        if (found) {
          setSelectedCustomerId(found.customer?._id || "");
          setSelectedOrderId(preselectedOrderId);
          setSelectedOrder(found);
          const init = {};
          (found.orderItems || []).forEach((item) => {
            if ((item.deliveredQuantity || 0) > 0) {
              init[item.product._id] = { reason: "", returnQty: item.deliveredQuantity };
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
    // For customer role: fetch only their orders by passing their ID
    // For admin/salesman: fetch all orders (no customerId parameter)
    const initCustomerId = null;
    fetchDeliveredOrders(initCustomerId);
  }, [fetchUser, fetchDeliveredOrders]);

  // Get unique customers from deliveredOrders
  const uniqueCustomers = useMemo(() => {
    const map = {};
    deliveredOrders.forEach((o) => {
      if (o.customer && o.customer._id) {
        map[o.customer._id] = o.customer;
      }
    });
    return Object.values(map);
  }, [deliveredOrders]);


  // Determine if user is customer
  const isCustomer = user?.role?.toString().trim().toLowerCase() === "customer";

  // Redirect customers away from create return page (they can only view returns)
  useEffect(() => {
    if (user && isCustomer) {
      navigate("/sales-returns");
    }
  }, [user, isCustomer, navigate]);

  // Orders to display: all delivered orders if admin/salesman (no customer selected yet), 
  // or filtered by selected customer, or customer's own orders if customer role
  const customerOrders = useMemo(() => {
    if (isCustomer) {
      // Customer role: backend already filtered to their orders, show all
      return deliveredOrders;
    } else if (selectedCustomerId) {
      // Admin/Salesman with customer selected: backend should have filtered, but apply client-side filter as safety check
      return deliveredOrders.filter((o) => String(o.customer?._id) === String(selectedCustomerId));
    } else {
      // Admin/Salesman with no customer selected: show all available orders
      return deliveredOrders;
    }
  }, [deliveredOrders, selectedCustomerId, isCustomer]);

  // Auto-select customer for customer role ONLY
  useEffect(() => {
    if (isCustomer && user && user._id && !selectedCustomerId) {
      setSelectedCustomerId(user._id);
    }
  }, [user, isCustomer, selectedCustomerId]);

  // When customer changes, reset order selection and refetch orders for that customer
  const handleCustomerChange = (e) => {
    const newCustomerId = e.target.value;
    setSelectedCustomerId(newCustomerId);
    setSelectedOrderId("");
    setSelectedOrder(null);
    setReturnItems({});
    
    // Refetch orders for the selected customer
    if (newCustomerId) {
      setLoadingOrders(true);
      fetchDeliveredOrders(newCustomerId);
    }
  };

  const handleOrderSelect = (orderId) => {
    setSelectedOrderId(orderId);
    if (!orderId) {
      setSelectedOrder(null);
      setReturnItems({});
      return;
    }
    const order = customerOrders.find((o) => o._id === orderId);
    setSelectedOrder(order || null);
    const alreadyReturned = order?.alreadyReturnedQty || {};
    const init = {};
    (order?.orderItems || []).forEach((item) => {
      const deliveredQty = item.deliveredQuantity || 0;
      const prodId = item.product._id;
      const already = alreadyReturned[prodId] || 0;
      const remaining = deliveredQty - already;
      if (remaining > 0) {
        init[prodId] = { reason: "", returnQty: remaining };
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

  const getDeliveredItems = () => {
    const alreadyReturned = selectedOrder?.alreadyReturnedQty || {};
    return (selectedOrder?.orderItems || []).filter((i) => {
      const deliveredQty = i.deliveredQuantity || 0;
      const prodId = i.product._id?.toString() || i.product?.toString();
      const already = alreadyReturned[prodId] || 0;
      return deliveredQty - already > 0;
    });
  };

  const calcTotal = () =>
    getDeliveredItems().reduce((sum, item) => {
      const productId = item.product._id;
      const returnQty = parseInt(returnItems[productId]?.returnQty || 0);
      if (returnQty <= 0) return sum;
      const exclVat = returnQty * item.price;
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
        returnedQuantity: parseInt(returnItems[item.product._id]?.returnQty || 0),
        reason: returnItems[item.product._id]?.reason || "",
      }))
      .filter((i) => i.returnedQuantity > 0);

    if (itemsToReturn.length === 0) {
      toast.error("Please enter at least one return quantity");
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
              <p className="csr-page-sub">Returns can only be made within 30 days of delivery</p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Step 1: Select Customer (if not customer) and Order */}
            <div className="csr-card">
              <div className="csr-card-header">
                <h2>Step 1 — {isCustomer ? "Select Order" : "Select Customer & Order"}</h2>
              </div>
              <div className="csr-card-body">
                {loadingOrders ? (
                  <p className="csr-loading">Loading delivered orders...</p>
                ) : (
                  <>
                    {/* Customer dropdown is only for admin/salesman, never for customer role */}
                    {user && !isCustomer && (
                      <div className="csr-form-group">
                        <label>Select Customer</label>
                        <select
                          className="csr-select"
                          value={selectedCustomerId}
                          onChange={handleCustomerChange}
                        >
                          {uniqueCustomers.length === 0 && <option value="">No customers found</option>}
                          {uniqueCustomers.map((c) => (
                            <option key={c._id} value={c._id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="csr-form-group">
                      <label>Select Order</label>
                      <select
                        className="csr-select"
                        value={selectedOrderId}
                        onChange={(e) => handleOrderSelect(e.target.value)}
                      >
                        <option value="">-- Select an order --</option>
                        {customerOrders.map((o) => (
                          <option key={o._id} value={o._id}>
                            {o.invoiceNumber || o._id.slice(-8)} — {new Date(o.updatedAt).toLocaleDateString("en-GB")}
                          </option>
                        ))}
                      </select>
                    </div>
                    {customerOrders.length === 0 && (
                      <div className="csr-info-box">
                        No delivered orders within the last 30 days. Returns can only be made within 30 days of delivery.
                      </div>
                    )}
                  </>
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
                  <h2>Step 2 — Items to Return</h2>
                  <p className="csr-card-sub">Enter the quantity to return for each item (0 to skip).</p>
                </div>
                <div className="csr-card-body">
                  <div className="csr-items-table-wrap">
                    <table className="csr-items-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Unit</th>
                          <th>Delivered Qty</th>
                          <th>Already Returned</th>
                          <th>Remaining</th>
                          <th>Return Qty</th>
                          <th>Price / Unit</th>
                          <th>Return Amount</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deliveredItems.map((item) => {
                          const productId = item.product._id;
                          const deliveredQty = item.deliveredQuantity || 0;
                          const alreadyReturned = (selectedOrder?.alreadyReturnedQty || {})[productId] || 0;
                          const remainingQty = deliveredQty - alreadyReturned;
                          const returnQty = parseInt(returnItems[productId]?.returnQty || 0);
                          const exclVat = returnQty * item.price;
                          const vat = (exclVat * (item.vatPercentage || 5)) / 100;
                          const lineTotal = exclVat + vat;

                          return (
                            <tr key={productId} className={returnQty > 0 ? "csr-row-selected" : ""}>
                              <td>
                                <div className="csr-product-name">
                                  {item.product?.productName || "—"}
                                </div>
                              </td>
                              <td>{item.unit || item.product?.unit || "—"}</td>
                              <td>
                                <span className="csr-delivered-badge">
                                  {deliveredQty}
                                </span>
                              </td>
                              <td>
                                {alreadyReturned > 0 ? (
                                  <span style={{ color: "#e67e22", fontWeight: 600 }}>{alreadyReturned}</span>
                                ) : (
                                  <span style={{ color: "#aaa" }}>—</span>
                                )}
                              </td>
                              <td>
                                <span style={{ color: "#27ae60", fontWeight: 600 }}>{remainingQty}</span>
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  max={remainingQty}
                                  value={returnItems[productId]?.returnQty ?? remainingQty}
                                  onChange={(e) => {
                                    const val = Math.min(
                                      Math.max(0, parseInt(e.target.value) || 0),
                                      remainingQty
                                    );
                                    handleItemChange(productId, "returnQty", val);
                                  }}
                                  className="csr-qty-input"
                                />
                              </td>
                              <td>AED {(item.price || 0).toFixed(2)}</td>
                              <td className="csr-line-total">
                                AED {lineTotal.toFixed(2)}
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={returnItems[productId]?.reason || ""}
                                  onChange={(e) => handleItemChange(productId, "reason", e.target.value)}
                                  className="csr-reason-input"
                                  placeholder="Reason (optional)"
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
