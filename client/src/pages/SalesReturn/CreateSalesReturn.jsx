// src/pages/SalesReturn/CreateSalesReturn.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../../components/layout/Header/Header";
import Sidebar from "../../components/layout/Sidebar/Sidebar";
import toast from "../../utils/toast";
import axios from "axios";
import TableScrollSync from "../../components/common/TableScrollSync";
import SearchableSelect from "../../components/common/SearchableSelect";
import "./CreateSalesReturn.css";

// An order can have several packing/delivery invoices (partial deliveries
// over time). Group deliveredInvoiceHistory entries by invoiceNumber (a
// single invoice can itself span more than one delivery event) so each
// physical invoice becomes one selectable unit, sorted chronologically —
// needed below to allocate already-returned quantities FIFO across invoices.
const buildInvoiceGroups = (order) => {
  const history = order.deliveredInvoiceHistory || [];
  if (history.length === 0) {
    // Fallback for orders with no recorded deliveredInvoiceHistory (very old
    // orders, or ones delivered via the admin "mark delivered" shortcut) —
    // treat the whole order as a single invoice using cumulative quantities.
    return [
      {
        invoiceNumber: order.invoiceNumber || order.deliveredInvoiceNumber || order._id.slice(-8),
        date: order.deliveredAt || order.updatedAt,
        items: (order.orderItems || [])
          .filter((it) => (it.deliveredQuantity || 0) > 0)
          .map((it) => ({ productId: String(it.product?._id || it.product), qty: it.deliveredQuantity })),
      },
    ];
  }

  const byInvoice = new Map();
  history.forEach((h) => {
    if (!byInvoice.has(h.invoiceNumber)) {
      byInvoice.set(h.invoiceNumber, { invoiceNumber: h.invoiceNumber, date: h.createdAt, items: {} });
    }
    const group = byInvoice.get(h.invoiceNumber);
    if (new Date(h.createdAt) < new Date(group.date)) group.date = h.createdAt;
    (h.items || []).forEach((it) => {
      const pid = String(it.product?._id || it.product);
      group.items[pid] = (group.items[pid] || 0) + (it.quantity || 0);
    });
  });

  return [...byInvoice.values()]
    .map((g) => ({
      invoiceNumber: g.invoiceNumber,
      date: g.date,
      items: Object.entries(g.items).map(([productId, qty]) => ({ productId, qty })),
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
};

// "Already returned" is tracked per order+product (not per invoice), so when
// the same product was invoiced across more than one batch we allocate past
// returns FIFO — earliest invoice's quantity is consumed first — to work out
// how much of THIS specific invoice is still returnable.
const getInvoiceItemsWithRemaining = (order, invoiceNumber) => {
  const groups = buildInvoiceGroups(order);
  const alreadyReturned = order.alreadyReturnedQty || {};
  const cumulativeBefore = {};
  let targetGroup = null;
  for (const g of groups) {
    if (g.invoiceNumber === invoiceNumber) {
      targetGroup = g;
      break;
    }
    g.items.forEach((it) => {
      cumulativeBefore[it.productId] = (cumulativeBefore[it.productId] || 0) + it.qty;
    });
  }
  if (!targetGroup) return [];

  return targetGroup.items.map((it) => {
    const before = cumulativeBefore[it.productId] || 0;
    const totalReturned = alreadyReturned[it.productId] || 0;
    const consumedFromThisInvoice = Math.max(0, Math.min(it.qty, totalReturned - before));
    return {
      productId: it.productId,
      invoicedQty: it.qty,
      alreadyReturnedForThisInvoice: consumedFromThisInvoice,
      remaining: it.qty - consumedFromThisInvoice,
    };
  });
};

const CreateSalesReturn = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedOrderId = searchParams.get("orderId") || "";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [deliveredOrders, setDeliveredOrders] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState("");
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

      // Auto-select if orderId was passed in URL — default to whichever of
      // that order's invoices still has something returnable, or its most
      // recent invoice otherwise.
      if (preselectedOrderId) {
        const found = res.data.find((o) => o._id === preselectedOrderId);
        if (found) {
          setSelectedCustomerId(found.customer?._id || "");
          const groups = buildInvoiceGroups(found);
          const groupWithRemaining = groups.find((g) =>
            getInvoiceItemsWithRemaining(found, g.invoiceNumber).some((it) => it.remaining > 0)
          );
          const targetGroup = groupWithRemaining || groups[groups.length - 1];
          if (targetGroup) {
            selectInvoice(found, targetGroup.invoiceNumber);
          }
        }
      }
    } catch {
      toast.error("Failed to load delivered orders");
    } finally {
      setLoadingOrders(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Redirect customers and Sales Manager away from create return page
  useEffect(() => {
    if (user && (isCustomer || user?.role === "Sales Manager")) {
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

  // Populate the return form scoped to ONE specific invoice — deliveredQty,
  // "already returned", and remaining are all computed for just that
  // invoice's own items, not the whole order's cumulative totals.
  const selectInvoice = (order, invoiceNumber) => {
    setSelectedOrderId(order._id);
    setSelectedInvoiceNumber(invoiceNumber);

    const invoiceItems = getInvoiceItemsWithRemaining(order, invoiceNumber);
    const productInfoMap = {};
    (order.orderItems || []).forEach((oi) => {
      const pid = String(oi.product?._id || oi.product);
      productInfoMap[pid] = oi;
    });

    const syntheticOrderItems = invoiceItems.map((ii) => {
      const info = productInfoMap[ii.productId] || {};
      return {
        product: info.product || { _id: ii.productId },
        unit: info.unit,
        price: info.price,
        vatPercentage: info.vatPercentage,
        deliveredQuantity: ii.invoicedQty,
      };
    });
    const syntheticAlreadyReturned = {};
    invoiceItems.forEach((ii) => {
      syntheticAlreadyReturned[ii.productId] = ii.alreadyReturnedForThisInvoice;
    });

    setSelectedOrder({
      ...order,
      invoiceNumber,
      orderItems: syntheticOrderItems,
      alreadyReturnedQty: syntheticAlreadyReturned,
    });

    const init = {};
    invoiceItems.forEach((ii) => {
      if (ii.remaining > 0) {
        init[ii.productId] = { reason: "", returnQty: ii.remaining };
      }
    });
    setReturnItems(init);
  };

  // Dropdown onChange — value is a composite "orderId::invoiceNumber" key
  // (see invoiceOptions below), since one order can list several invoices.
  const handleInvoiceSelect = (compositeValue) => {
    if (!compositeValue) {
      setSelectedOrderId("");
      setSelectedInvoiceNumber("");
      setSelectedOrder(null);
      setReturnItems({});
      return;
    }
    const sepIdx = compositeValue.lastIndexOf("::");
    const orderId = compositeValue.slice(0, sepIdx);
    const invoiceNumber = compositeValue.slice(sepIdx + 2);
    const order = customerOrders.find((o) => o._id === orderId);
    if (!order) return;
    selectInvoice(order, invoiceNumber);
  };

  // One dropdown option per invoice (not per order) — an order with multiple
  // packing/delivery rounds shows each of its invoices separately. An invoice
  // that's already been fully returned (nothing left with remaining > 0) is
  // left out entirely — it's done, there's nothing more to return against it.
  const invoiceOptions = useMemo(() => {
    const options = [];
    customerOrders.forEach((order) => {
      buildInvoiceGroups(order).forEach((g) => {
        const hasRemaining = getInvoiceItemsWithRemaining(order, g.invoiceNumber).some(
          (it) => it.remaining > 0
        );
        if (!hasRemaining) return;
        options.push({
          value: `${order._id}::${g.invoiceNumber}`,
          label: `${g.invoiceNumber} — ${new Date(g.date).toLocaleDateString("en-GB")}`,
        });
      });
    });
    return options;
  }, [customerOrders]);

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

  // Rounded to the nearest whole AED, same rule as the printed credit note
  // (Sub Total + Round Off = Grand Total) — this is what actually gets
  // credited back to the customer once the return is processed.
  const calcTotal = () =>
    Math.round(
      getDeliveredItems().reduce((sum, item) => {
        const productId = item.product._id;
        const returnQty = parseInt(returnItems[productId]?.returnQty || 0);
        if (returnQty <= 0) return sum;
        const exclVat = returnQty * item.price;
        const vat = (exclVat * (item.vatPercentage || 5)) / 100;
        return sum + exclVat + vat;
      }, 0)
    );

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
        { orderId: selectedOrderId, invoiceNumber: selectedInvoiceNumber, returnItems: itemsToReturn, returnReason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(
        user?.role === "Admin"
          ? "Return created and approved"
          : "Return request submitted for admin approval"
      );
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
      <Header sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} user={user} />
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
                        <SearchableSelect
                          className="csr-select"
                          options={uniqueCustomers.map((c) => ({ value: c._id, label: c.name }))}
                          value={selectedCustomerId}
                          onChange={(val) => handleCustomerChange({ target: { value: val } })}
                          placeholder={uniqueCustomers.length === 0 ? "No customers found" : "Select Customer"}
                          disabled={uniqueCustomers.length === 0}
                        />
                      </div>
                    )}
                    <div className="csr-form-group">
                      <label>Select Order</label>
                      <SearchableSelect
                        className="csr-select"
                        options={invoiceOptions}
                        value={selectedOrderId ? `${selectedOrderId}::${selectedInvoiceNumber}` : ""}
                        onChange={(val) => handleInvoiceSelect(val)}
                        placeholder="-- Select an invoice --"
                      />
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
                  <TableScrollSync>
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
                  </TableScrollSync>
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
