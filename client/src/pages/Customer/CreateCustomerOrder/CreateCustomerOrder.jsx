// src/pages/Customer/Orders/CreateCustomerOrder.jsx
import React, { useState, useEffect, useCallback } from "react";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import "./CreateCustomerOrder.css";
import axios from "axios";
import toast from "react-hot-toast";

const CreateCustomerOrder = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [customerProfile, setCustomerProfile] = useState(null);
  const [formData, setFormData] = useState({
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
        window.location.href = "/login";
        return;
      }
      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data.user || response.data);
    } catch (error) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  const fetchCustomerProfile = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/customers/my-profile`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const profile = response.data;
      setCustomerProfile(profile);

      const defaultPayment = profile?.paymentMethod ||
                            profile?.defaultPayment ||
                            "credit";

      setFormData((prev) => ({
        ...prev,
        payment: defaultPayment,
      }));
    } catch (error) {
      toast.error("Failed to load customer profile");
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchProducts();
    fetchCurrentUser();
    fetchCustomerProfile();
  }, [fetchProducts, fetchCurrentUser, fetchCustomerProfile]);

  // Real API call for previous purchased price
  const fetchPreviousPrice = useCallback(async (productId, index) => {
    if (!customerProfile?._id || !productId) return;

    try {
      const token = localStorage.getItem("token");
      const res = await axios.get(
        `${backendUrl}/api/orders/previous-price`,
        {
          params: {
            customerId: customerProfile._id,
            productId,
          },
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
    }
  }, [backendUrl, customerProfile, formData.orderItems]);

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

    // Fetch previous price
    fetchPreviousPrice(productId, index);
  };

  const updateGrandTotal = (items = formData.orderItems) => {
    const total = items.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
    setGrandTotal(total.toFixed(2));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.payment) newErrors.payment = "Payment method is required";

    formData.orderItems.forEach((item, index) => {
      if (!item.productId) newErrors[`orderItems.${index}.productId`] = "Product required";
      if (!item.orderedQuantity || parseInt(item.orderedQuantity) < 1) {
        newErrors[`orderItems.${index}.orderedQuantity`] = "Quantity ≥ 1 required";
      }
      if (!item.price) newErrors[`orderItems.${index}.price`] = "Price required";
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  setIsLoading(true);

  try {
    const token = localStorage.getItem('token');

    if (!customerProfile) {
      toast.error('Customer profile not found');
      setIsLoading(false);
      return;
    }

    // Check if first order
    const checkRes = await axios.get(
      `${backendUrl}/api/orders/check-first-order/${customerProfile._id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const isFirstOrder = checkRes.data.isFirst;

    if (isFirstOrder) {
      // Send as request
      await axios.post(
        `${backendUrl}/api/orders/order-request`,
        {
          orderItems: formData.orderItems.map(item => ({
            productId: item.productId,
            orderedQuantity: parseInt(item.orderedQuantity),
          })),
          payment: formData.payment,
          remarks: formData.remarks.trim(),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('First order request sent! Waiting for admin approval.');
      setTimeout(() => (window.location.href = '/customer/orders'), 2000);
    } else {
      // Normal order
      await axios.post(
        `${backendUrl}/api/orders/createorder`,
        {
          customerId: customerProfile._id,
          payment: formData.payment,
          remarks: formData.remarks.trim(),
          orderItems: formData.orderItems.map(item => ({
            productId: item.productId,
            orderedQuantity: parseInt(item.orderedQuantity),
          })),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('Order placed successfully!');
      setTimeout(() => (window.location.href = '/customer/orders'), 1500);
    }
  } catch (err) {
    const msg = err.response?.data?.message || 'Failed to process order';
    toast.error(msg);
  } finally {
    setIsLoading(false);
  }
};
  if (loading) return <div className="create-customer-order-loading">Loading...</div>;

  return (
    <div className="create-customer-order-layout">
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
      <main className={`create-customer-order-main-content ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="create-customer-order-form-card">
          <h1>Create New Order</h1>

          {customerProfile && (
            <div className="customer-info-banner">
              <span className="customer-name">{customerProfile.name}</span>
              <span className="customer-payment">
                Payment method: <strong>{formData.payment.toUpperCase()}</strong>
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <select
                value={formData.payment}
                onChange={(e) => setFormData({ ...formData, payment: e.target.value })}
                disabled
                className="auto-filled"
              >
                <option value="credit">Credit</option>
                <option value="cash">Cash</option>
              </select>
              {errors.payment && <p className="error-text">{errors.payment}</p>}
              <p className="helper-text">Payment method is set from your customer profile</p>
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
                        {p.productName} - AED {p.price.toFixed(2)} / {p.unit}
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

export default CreateCustomerOrder;