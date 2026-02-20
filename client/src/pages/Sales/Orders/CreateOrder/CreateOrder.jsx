// src/pages/Orders/CreateOrder/CreateOrder.jsx
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../../../components/layout/Header/Header";
import Sidebar from "../../../../components/layout/Sidebar/Sidebar";
import "./CreateOrder.css";
import { useNavigate } from "react-router-dom";
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
    orderItems: [{ productId: "", orderedQuantity: "", price: "", total: "", prevPrice: "" }],
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [grandTotal, setGrandTotal] = useState("0.00");

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();

  const fetchCustomers = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/customers/getallcustomers`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCustomers(response.data);
    } catch (error) {
      toast.error("Failed to load customers");
    }
  }, [backendUrl]);

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
      setUser(response.data.user || response.data);
    } catch (error) {
      localStorage.removeItem("token");
      navigate("/login");
    } finally {
      setLoading(false);
    }
  }, [backendUrl, navigate]);

  useEffect(() => {
    fetchCustomers();
    fetchProducts();
    fetchCurrentUser();
  }, [fetchCustomers, fetchProducts, fetchCurrentUser]);

  // Real API call for previous purchased price
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
        const newItems = [...formData.orderItems];
        newItems[index].prevPrice = parseFloat(price).toFixed(2);
        setFormData((prev) => ({ ...prev, orderItems: newItems }));
      }
    } catch (err) {
      console.error("Failed to fetch previous price:", err);
      // Optionally show toast: toast.error("Could not load previous price");
    }
  }, [backendUrl, formData.orderItems]);

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      orderItems: [...prev.orderItems, { productId: "", orderedQuantity: "", price: "", total: "", prevPrice: "" }],
    }));
  };

  const removeItem = (index) => {
    if (formData.orderItems.length === 1) return;
    const newItems = formData.orderItems.filter((_, i) => i !== index);
    setFormData((prev) => ({ ...prev, orderItems: newItems }));
    updateGrandTotal(newItems);
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.orderItems];
    newItems[index][field] = value;

    if (field === "orderedQuantity" || field === "price") {
      const qty = parseFloat(newItems[index].orderedQuantity) || 0;
      const price = parseFloat(newItems[index].price) || 0;
      newItems[index].total = (qty * price).toFixed(2);
    }

    setFormData((prev) => ({ ...prev, orderItems: newItems }));
    updateGrandTotal(newItems);
  };

  const handleProductSelect = (index, productId) => {
    const selectedProduct = products.find((p) => p._id === productId);
    const newItems = [...formData.orderItems];
    newItems[index].productId = productId;
    newItems[index].price = selectedProduct ? selectedProduct.price.toFixed(2) : "";

    const qty = parseFloat(newItems[index].orderedQuantity) || 0;
    const price = parseFloat(newItems[index].price) || 0;
    newItems[index].total = (qty * price).toFixed(2);

    setFormData((prev) => ({ ...prev, orderItems: newItems }));
    updateGrandTotal(newItems);

    // Fetch previous price only if customer is selected
    if (formData.customerId) {
      fetchPreviousPrice(formData.customerId, productId, index);
    }
  };

  const updateGrandTotal = (items = formData.orderItems) => {
    const total = items.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
    setGrandTotal(total.toFixed(2));
  };

  const handleCustomerChange = (e) => {
    const selectedCustomerId = e.target.value;
    const selectedCustomer = customers.find((c) => c._id === selectedCustomerId);

    const defaultPayment = selectedCustomer?.paymentMethod ||
                          selectedCustomer?.defaultPayment ||
                          "credit";

    setFormData({
      ...formData,
      customerId: selectedCustomerId,
      payment: defaultPayment,
    });

    // Re-check previous prices for all current items
    formData.orderItems.forEach((item, idx) => {
      if (item.productId) {
        fetchPreviousPrice(selectedCustomerId, item.productId, idx);
      }
    });
  };

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
        orderItems: formData.orderItems.map((item) => ({
          productId: item.productId,
          orderedQuantity: parseInt(item.orderedQuantity),
        })),
      };

      await axios.post(`${backendUrl}/api/orders/createorder`, submitData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      toast.success("Order created successfully!");
      setTimeout(() => navigate("/order/list"), 1500);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create order");
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
          <h1>Create New Order</h1>

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
                {formData.customerId && <span className="auto-fetch-badge"> of Customer</span>}
              </label>
              <select
                value={formData.payment}
                onChange={(e) => setFormData({ ...formData, payment: e.target.value })}
                disabled={!!formData.customerId}
                className={formData.customerId ? "auto-filled" : ""}
              >
                <option value="credit">Credit</option>
                <option value="cash">Cash</option>
              </select>
              {errors.payment && <p className="error-text">{errors.payment}</p>}
            </div>

            <h3>Order Items</h3>
            {formData.orderItems.map((item, index) => (
              <div key={index} className="order-item-row">
                <div className="item-field">
                  <label>Product</label>
                  <select
                    value={item.productId}
                    onChange={(e) => handleProductSelect(index, e.target.value)}
                  >
                    <option value="">Select Product</option>
                    {products.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.productName} - {p.unit}
                      </option>
                    ))}
                  </select>
                  {errors[`orderItems.${index}.productId`] && (
                    <p className="error-text">{errors[`orderItems.${index}.productId`]}</p>
                  )}
                </div>

                <div className="item-field">
                  <label>Quantity</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Quantity"
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

                <div className="item-field">
                  <label>Total (AED)</label>
                  <input
                    type="text"
                    value={item.total || "0.00"}
                    readOnly
                    className="readonly-input"
                    placeholder="Auto-calculated"
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

            <div className="grand-total-section">
              <label>Grand Total (AED)</label>
              <input
                type="text"
                value={grandTotal}
                readOnly
                className="grand-total-input"
              />
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
              {isLoading ? "Creating..." : "Create Order"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateOrder;