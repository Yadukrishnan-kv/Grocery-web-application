// src/pages/Orders/CreateOrder/CreateOrder.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import ProductSearchDropdown from "../../../../components/common/ProductSearchDropdown";
import Header from "../../../../components/layout/Header/Header";
import Sidebar from "../../../../components/layout/Sidebar/Sidebar";
import "./CreateOrder.css";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";

const CreateOrder = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({
    customerId: "",
    payment: "credit",
    remarks: "",
    scheduleDays: "",
    orderItems: [
      {
        productId: "",
        orderedQuantity: "",
        price: "",
        exclVat: "0.00",
        vatPercentage: 5,
        vatAmount: "0.00",
        total: "0.00",
        prevPrice: "",
      },
    ],
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // ✅ NEW: Grand Total Breakdown States
  const [grandTotal, setGrandTotal] = useState("0.00");
  const [totalExclVat, setTotalExclVat] = useState("0.00");
  const [totalVatAmount, setTotalVatAmount] = useState("0.00");

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editOrderId = searchParams.get("edit");
  const isEditMode = Boolean(editOrderId);

  // ────────────────────────────────────────────────
  // Fetch Data
  // ────────────────────────────────────────────────
  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }
      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const userData = response.data.user || response.data;
      
      // Admin and Sales man can create orders. Sales Manager cannot.
      if (userData.role === "Sales Manager") {
        toast.error("Sales Manager cannot create orders. Please use Manage Orders to assign deliveries.");
        navigate("/dashboard");
        return;
      }
      
      if (!["Admin", "Sales man"].includes(userData.role)) {
        toast.error("You don't have permission to create orders.");
        navigate("/dashboard");
        return;
      }
      
      setUser(userData);
    } catch (error) {
      localStorage.removeItem("token");
      navigate("/login");
    } finally {
      setLoading(false);
    }
  }, [backendUrl, navigate]);

  const fetchCustomers = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      let endpoint;
      if (user?.role === "Sales man") {
        endpoint = `${backendUrl}/api/customers/salesman-customers`;
      } else {
        endpoint = `${backendUrl}/api/customers/getallcustomers`;
      }
      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCustomers(response.data);
    } catch (error) {
      toast.error("Failed to load customers");
    }
  }, [backendUrl, user]);

  const fetchProducts = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/products/getallproducts`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setProducts(response.data);
    } catch (error) {
      toast.error("Failed to load products");
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchProducts();
  }, [fetchCurrentUser, fetchProducts]);

  useEffect(() => {
    if (user) {
      fetchCustomers();
    }
  }, [user, fetchCustomers]);

  // ── Edit mode: fetch order and pre-fill form ──
  const fetchEditOrder = useCallback(async () => {
    if (!editOrderId || !user) return;
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(`${backendUrl}/api/orders/getorderbyid/${editOrderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const order = res.data;

      if (order.status !== "pending") {
        toast.error("Only pending orders can be edited");
        navigate("/order/list");
        return;
      }

      if (order.packedStatus && order.packedStatus !== "not_packed") {
        toast.error("Cannot edit an order that has been packed");
        navigate("/order/list");
        return;
      }

      if (order.assignmentStatus === "accepted") {
        toast.error("Cannot edit an order that has been accepted by delivery partner");
        navigate("/order/list");
        return;
      }

      const items = order.orderItems.map((item) => ({
        productId: item.product?._id || item.product,
        orderedQuantity: String(item.orderedQuantity),
        price: item.price?.toFixed(2) || "",
        exclVat: item.exclVatAmount?.toFixed(2) || "0.00",
        vatPercentage: item.vatPercentage || 5,
        vatAmount: item.vatAmount?.toFixed(2) || "0.00",
        total: item.totalAmount?.toFixed(2) || "0.00",
        prevPrice: "",
      }));

      setFormData({
        customerId: order.customer?._id || "",
        payment: order.payment || "credit",
        remarks: order.remarks || "",
        scheduleDays: String(order.scheduleDays || ""),
        orderItems: items,
      });

      updateGrandTotal(items);
    } catch (err) {
      toast.error("Failed to load order for editing");
      navigate("/order/list");
    }
  }, [editOrderId, user, backendUrl, navigate]);

  const editFetchedRef = useRef(false);
  useEffect(() => {
    if (user && editOrderId && !editFetchedRef.current) {
      editFetchedRef.current = true;
      fetchEditOrder();
    }
  }, [user, editOrderId, fetchEditOrder]);

  // ────────────────────────────────────────────────
  // ✅ VAT Calculation Functions
  // ────────────────────────────────────────────────
  const calculateItemVAT = (item) => {
    const qty = parseFloat(item.orderedQuantity) || 0;
    const price = parseFloat(item.price) || 0;
    const vatPercent = parseFloat(item.vatPercentage) || 5;

    const exclVat = qty * price;
    const vatAmount = (exclVat * vatPercent) / 100;
    const total = exclVat + vatAmount;

    return {
      exclVat: exclVat.toFixed(2),
      vatAmount: vatAmount.toFixed(2),
      total: total.toFixed(2),
    };
  };

  // ✅ UPDATED: Calculate Grand Total with VAT Breakdown
  const updateGrandTotal = (items) => {
    let sumExclVat = 0;
    let sumVatAmount = 0;
    let sumTotal = 0;

    items.forEach((item) => {
      sumExclVat += parseFloat(item.exclVat) || 0;
      sumVatAmount += parseFloat(item.vatAmount) || 0;
      sumTotal += parseFloat(item.total) || 0;
    });

    setTotalExclVat(sumExclVat.toFixed(2));
    setTotalVatAmount(sumVatAmount.toFixed(2));
    setGrandTotal(sumTotal.toFixed(2));
  };

  // ────────────────────────────────────────────────
  // Item Management
  // ────────────────────────────────────────────────
  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      orderItems: [
        ...prev.orderItems,
        {
          productId: "",
          orderedQuantity: "",
          price: "",
          exclVat: "0.00",
          vatPercentage: 5,
          vatAmount: "0.00",
          total: "0.00",
          prevPrice: "",
        },
      ],
    }));
  };

  const removeItem = (index) => {
    if (formData.orderItems.length === 1) return;
    setFormData((prev) => {
      const newItems = prev.orderItems.filter((_, i) => i !== index);
      updateGrandTotal(newItems);
      return { ...prev, orderItems: newItems };
    });
  };

  const handleItemChange = (index, field, value) => {
    setFormData((prev) => {
      const newItems = [...prev.orderItems];
      newItems[index][field] = value;

      if (field === "orderedQuantity" || field === "price" || field === "vatPercentage") {
        const calculated = calculateItemVAT(newItems[index]);
        newItems[index].exclVat = calculated.exclVat;
        newItems[index].vatAmount = calculated.vatAmount;
        newItems[index].total = calculated.total;
      }

      updateGrandTotal(newItems);
      return { ...prev, orderItems: newItems };
    });
  };

  const handleProductSelect = (index, productId) => {
    const selectedProduct = products.find((p) => p._id === productId);
    setFormData((prev) => {
      const newItems = [...prev.orderItems];
      newItems[index].productId = productId;
      newItems[index].price = selectedProduct ? selectedProduct.price.toFixed(2) : "";

      const calculated = calculateItemVAT(newItems[index]);
      newItems[index].exclVat = calculated.exclVat;
      newItems[index].vatAmount = calculated.vatAmount;
      newItems[index].total = calculated.total;

      updateGrandTotal(newItems);
      return { ...prev, orderItems: newItems };
    });

    if (formData.customerId) {
      fetchPreviousPrice(formData.customerId, productId, index);
    }
  };

  const fetchPreviousPrice = useCallback(async (customerId, productId, index) => {
    if (!customerId || !productId) return;
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${backendUrl}/api/orders/previous-price`,
        {
          params: { customerId, productId },
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const { price } = res.data;
      if (price !== null && price !== undefined) {
        setFormData((prev) => {
          const newItems = [...prev.orderItems];
          newItems[index].prevPrice = parseFloat(price).toFixed(2);
          return { ...prev, orderItems: newItems };
        });
      }
    } catch (err) {
      console.error("Failed to fetch previous price:", err);
    }
  }, [backendUrl]);

  const handleCustomerChange = (e) => {
    const selectedCustomerId = e.target.value;
    const selectedCustomer = customers.find((c) => c._id === selectedCustomerId);
    // Map billingType to default payment (user can still override)
    const defaultPayment =
      selectedCustomer?.billingType === "Cash" ? "cash" : "credit";

    setFormData({
      ...formData,
      customerId: selectedCustomerId,
      payment: defaultPayment,
    });

    formData.orderItems.forEach((item, idx) => {
      if (item.productId) {
        fetchPreviousPrice(selectedCustomerId, item.productId, idx);
      }
    });
  };

  // ────────────────────────────────────────────────
  // Validation & Submit
  // ────────────────────────────────────────────────
  const validateForm = () => {
    const newErrors = {};
    if (!formData.customerId) newErrors.customerId = "Customer is required";
    if (!formData.payment) newErrors.payment = "Payment method is required";

    formData.orderItems.forEach((item, index) => {
      if (!item.productId) newErrors[`orderItems.${index}.productId`] = "Product is required";
      if (!item.orderedQuantity || parseInt(item.orderedQuantity) < 1) {
        newErrors[`orderItems.${index}.orderedQuantity`] = "Valid quantity ≥ 1 required";
      }
      if (!item.price) newErrors[`orderItems.${index}.price`] = "Price is required";
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);

    try {
      const token = localStorage.getItem("token");
      const submitData = {
        customerId: formData.customerId,
        payment: formData.payment,
        remarks: formData.remarks.trim(),
        scheduleDays: parseInt(formData.scheduleDays) || 0,
        orderItems: formData.orderItems.map((item) => ({
          productId: item.productId,
          orderedQuantity: parseInt(item.orderedQuantity),
          price: parseFloat(item.price),
          vatPercentage: parseFloat(item.vatPercentage) || 5,
          exclVatAmount: parseFloat(item.exclVat),
          vatAmount: parseFloat(item.vatAmount),
          totalAmount: parseFloat(item.total),
        })),
      };

      if (isEditMode) {
        await axios.put(`${backendUrl}/api/orders/updateorder/${editOrderId}`, submitData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success("Order updated successfully!");
      } else {
        await axios.post(`${backendUrl}/api/orders/createorder`, submitData, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success("Order created successfully!");
      }
      setTimeout(() => navigate("/order/list"), 1500);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save order");
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) return <div className="order-loading">Loading...</div>;

  return (
    <div className="order-form-layout">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        user={user}
      />
      <Sidebar
        isOpen={sidebarOpen}
        activeItem="Orders"
        onSetActiveItem={() => {}}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main className={`order-main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="order-form-card">
          <h1>{isEditMode ? "Edit Order" : "Create New Order"}</h1>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Customer</label>
              <select value={formData.customerId} onChange={handleCustomerChange}>
                <option value="">Select Customer</option>
                {customers.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.customerId && <p className="error-text">{errors.customerId}</p>}
            </div>

            <div className="form-group">
              <label>
                Payment Method
                {formData.customerId && <span className="auto-fetch-badge"> (pre-filled from customer, can override)</span>}
              </label>
              <select
                value={formData.payment}
                onChange={(e) => setFormData({ ...formData, payment: e.target.value })}
              >
                <option value="credit">Credit</option>
                <option value="cash">Cash</option>
              </select>
              {errors.payment && <p className="error-text">{errors.payment}</p>}
            </div>

            <h3>Order Items</h3>
            {formData.orderItems.map((item, index) => (
              <div key={index} className="order-item-row vat-enabled">
                <div className="item-field">
                  <label>Product</label>
                  <ProductSearchDropdown
                    products={products}
                    value={item.productId}
                    onChange={(productId) => handleProductSelect(index, productId)}
                    placeholder="Select Product"
                  />
                  {errors[`orderItems.${index}.productId`] && (
                    <p className="error-text">{errors[`orderItems.${index}.productId`]}</p>
                  )}
                </div>

                <div className="item-field">
                  <label>Quantity</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={item.orderedQuantity}
                    onChange={(e) => handleItemChange(index, "orderedQuantity", e.target.value)}
                  />
                  {errors[`orderItems.${index}.orderedQuantity`] && (
                    <p className="error-text">{errors[`orderItems.${index}.orderedQuantity`]}</p>
                  )}
                </div>

                <div className="item-field">
                  <label>Price (AED)</label>
                  <input
                    type="text"
                    value={item.price}
                    readOnly
                    className="readonly-input"
                    placeholder="Auto-filled"
                  />
                </div>

                {/* ✅ VAT Fields */}
                <div className="item-field vat-field">
                  <label>Excl. VAT</label>
                  <input
                    type="text"
                    value={item.exclVat || "0.00"}
                    readOnly
                    className="readonly-input vat-readonly"
                    title="Qty × Price"
                  />
                </div>

                <div className="item-field vat-field">
                  <label>VAT %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={item.vatPercentage}
                    onChange={(e) => handleItemChange(index, "vatPercentage", e.target.value)}
                    className="vat-input"
                  />
                </div>

                <div className="item-field vat-field">
                  <label>VAT Amount</label>
                  <input
                    type="text"
                    value={item.vatAmount || "0.00"}
                    readOnly
                    className="readonly-input vat-readonly"
                    title="Excl. VAT × VAT%"
                  />
                </div>

                <div className="item-field vat-field total-field">
                  <label>Total (Incl. VAT)</label>
                  <input
                    type="text"
                    value={item.total || "0.00"}
                    readOnly
                    className="readonly-input vat-total"
                    title="Excl. VAT + VAT Amount"
                  />
                </div>

                {item.prevPrice && (
                  <div className="item-field prev-price">
                    <label>Last Paid</label>
                    <input
                      type="text"
                      value={`AED ${item.prevPrice}`}
                      readOnly
                      className="readonly-input prev-price-input"
                    />
                  </div>
                )}

                {formData.orderItems.length > 1 && (
                  <button
                    type="button"
                    className="remove-item-btn"
                    onClick={() => removeItem(index)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}

            <button type="button" className="add-item-btn" onClick={addItem}>
              + Add Another Product
            </button>

            {/* ✅ UPDATED: Grand Total Section with VAT Breakdown */}
            <div className="grand-total-section">
              <div className="grand-total-row">
                <label>Total Dhs (Excl. VAT)</label>
                <input
                  type="text"
                  value={totalExclVat}
                  readOnly
                  className="grand-total-input subtotal"
                />
              </div>
              <div className="grand-total-row">
                <label>VAT 5%</label>
                <input
                  type="text"
                  value={totalVatAmount}
                  readOnly
                  className="grand-total-input vat"
                />
              </div>
              <div className="grand-total-row grand-total-final">
                <label>Grand Total (Incl. VAT)</label>
                <input
                  type="text"
                  value={grandTotal}
                  readOnly
                  className="grand-total-input final"
                />
              </div>
              <small className="vat-note">All amounts in AED</small>
            </div>

            <div className="form-group">
              <label>Schedule Day (Optional)</label>
              <input
                type="number"
                min="0"
               
                value={formData.scheduleDays}
                onChange={(e) => setFormData({ ...formData, scheduleDays: e.target.value })}
                className="order-select"
              />
              {formData.scheduleDays > 0 && (
                <p className="helper-text">
                  Order will be available for packing after {formData.scheduleDays} day{formData.scheduleDays > 1 ? 's' : ''}
                </p>
              )}
            </div>

            <div className="form-group">
              <label>Remarks (Optional)</label>
              <input
                type="text"
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                className="Remarks-input"
              />
            </div>

            <button type="submit" className="submit-btn" disabled={isLoading}>
              {isLoading ? "Saving..." : isEditMode ? "Update Order" : "Create Order"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateOrder;