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
    orderItems: [{ productId: "", orderedQuantity: "" }],
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fetchProducts = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/products/getallproducts`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
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
        {
          headers: { Authorization: `Bearer ${token}` },
        }
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

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      orderItems: [...prev.orderItems, { productId: "", orderedQuantity: "" }],
    }));
  };

  const removeItem = (index) => {
    if (formData.orderItems.length === 1) return;
    setFormData((prev) => ({
      ...prev,
      orderItems: prev.orderItems.filter((_, i) => i !== index),
    }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.orderItems];
    newItems[index][field] = value;
    setFormData((prev) => ({ ...prev, orderItems: newItems }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.payment) newErrors.payment = "Payment method is required";

    formData.orderItems.forEach((item, index) => {
      if (!item.productId)
        newErrors[`orderItems.${index}.productId`] = "Product required";
      if (!item.orderedQuantity || parseInt(item.orderedQuantity) < 1) {
        newErrors[`orderItems.${index}.orderedQuantity`] =
          "Quantity ≥ 1 required";
      }
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
      
      if (!customerProfile) {
        toast.error("Customer profile not found");
        setIsLoading(false);
        return;
      }
      const customerId = customerProfile._id;

      await axios.post(
        `${backendUrl}/api/orders/createorder`,
        {
          customerId,
          payment: formData.payment,
          remarks: formData.remarks.trim(),
          orderItems: formData.orderItems.map((item) => ({
            productId: item.productId,
            orderedQuantity: parseInt(item.orderedQuantity),
          })),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      toast.success("Order created successfully!");
      setTimeout(() => (window.location.href = "/customer/orders"), 1500);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create order");
    } finally {
      setIsLoading(false);
    }
  };

  if (loading)
    return <div className="create-customer-order-loading">Loading...</div>;

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
      <main
        className={`create-customer-order-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="create-customer-order-form-card">
          <h1>Create New Order</h1>

          {customerProfile && (
            <div className="customer-info-banner">
              <span className="customer-name">{customerProfile.name} </span>
              <span className="customer-payment">
                Payment method: <strong>{formData.payment.toUpperCase()}</strong>
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <select
                value={formData.payment}
                onChange={(e) =>
                  setFormData({ ...formData, payment: e.target.value })
                }
                disabled
                className="auto-filled"
              >
                <option value="credit">Credit</option>
                <option value="cash">Cash</option>
              </select>
              {errors.payment && <p className="error-text">{errors.payment}</p>}
              <p className="helper-text">
                Payment method is set from your customer profile
              </p>
            </div>

            <h3>Order Items</h3>
            {formData.orderItems.map((item, index) => (
              <div key={index} className="order-item-row">
                <select
                  value={item.productId}
                  onChange={(e) =>
                    handleItemChange(index, "productId", e.target.value)
                  }
                >
                  <option value="">Select Product</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.productName} - AED {p.price.toFixed(2)} / {p.unit}
                      {/* Removed stock display */}
                    </option>
                  ))}
                </select>

                <input
                  type="number"
                  min="1"
                  placeholder="Quantity"
                  value={item.orderedQuantity}
                  onChange={(e) =>
                    handleItemChange(index, "orderedQuantity", e.target.value)
                  }
                />

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

            {errors.orderItems && (
              <p className="error-text">{errors.orderItems}</p>
            )}

            <button type="button" className="add-item-btn" onClick={addItem}>
              + Add Another Product
            </button>

            <div className="form-group">
              <label>Remarks (Optional)</label>
              <textarea
                value={formData.remarks}
                onChange={(e) =>
                  setFormData({ ...formData, remarks: e.target.value })
                }
                rows="3"
                placeholder="Add any special instructions..."
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