// src/pages/Customer/Orders/CreateCustomerOrder.jsx
import React, { useState, useEffect, useCallback } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './CreateCustomerOrder.css';
import axios from 'axios';

const CreateCustomerOrder = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [formData, setFormData] = useState({
    productId: '',
    orderedQuantity: '',
    payment: 'credit',
    remarks: ''
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        window.location.href = '/login';
        return;
      }

      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(response.data.user || response.data);
    } catch (error) {
      console.error("Failed to load user", error);
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
  }, [backendUrl]);

  const fetchProducts = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/products/getallproducts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
      alert('Failed to load products');
    }
  }, [backendUrl]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.productId) {
      newErrors.productId = 'Product is required';
    }

    if (!formData.orderedQuantity || isNaN(formData.orderedQuantity) || parseInt(formData.orderedQuantity) < 1) {
      newErrors.orderedQuantity = 'Valid ordered quantity is required (minimum 1)';
    }

    if (!formData.payment) {
      newErrors.payment = 'Payment method is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSuccess(false);

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const token = localStorage.getItem('token');
      const config = {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      };

      // Get customer ID from logged-in user's customer profile
      const customerProfile = await axios.get(`${backendUrl}/api/customers/my-profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const customerId = customerProfile.data._id;

      await axios.post(`${backendUrl}/api/orders/createorder`, {
        customerId,
        productId: formData.productId,
        orderedQuantity: parseInt(formData.orderedQuantity),
        payment: formData.payment,
        remarks: formData.remarks.trim()
      }, config);

      setIsSuccess(true);
      setTimeout(() => {
        window.location.href = '/customer/orders';
      }, 1500);
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Something went wrong. Please try again.';
      setErrors({ submit: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchCurrentUser(), fetchProducts()]);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fetchCurrentUser, fetchProducts]);

  if (loading || !user) {
    return <div className="create-customer-order-loading">Loading...</div>;
  }

  const selectedProduct = products.find(p => p._id === formData.productId);

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
      <main className={`create-customer-order-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="create-customer-order-form-card">
          <h1>Create New Order</h1>
          {isSuccess && (
            <div className="create-customer-order-success-message" role="alert">
              Order created successfully!
            </div>
          )}
          <form onSubmit={handleSubmit} noValidate>
            <div className="create-customer-order-form-group">
              <label htmlFor="productId">Product</label>
              <select
                id="productId"
                name="productId"
                value={formData.productId}
                onChange={handleChange}
                aria-invalid={!!errors.productId}
                aria-describedby={errors.productId ? "productid-error" : undefined}
                className="create-customer-order-select"
              >
                <option value="">Select a product</option>
                {products.map(product => (
                  <option key={product._id} value={product._id}>
                    {product.productName} - AED{product.price.toFixed(2)} 
                    (Available: {product.quantity} {product.unit || 'units'})
                  </option>
                ))}
              </select>
              {errors.productId && (
                <p id="productid-error" className="create-customer-order-error-text">
                  {errors.productId}
                </p>
              )}
            </div>

            <div className="create-customer-order-form-row">
              <div className="create-customer-order-form-group">
                <label htmlFor="orderedQuantity">Ordered Quantity</label>
                <input
                  id="orderedQuantity"
                  name="orderedQuantity"
                  type="number"
                  min="1"
                  max={selectedProduct ? selectedProduct.quantity : undefined}
                  value={formData.orderedQuantity}
                  onChange={handleChange}
                  aria-invalid={!!errors.orderedQuantity}
                  aria-describedby={errors.orderedQuantity ? "orderedquantity-error" : undefined}
                  className="create-customer-order-input"
                  placeholder="Enter quantity"
                />
                {errors.orderedQuantity && (
                  <p id="orderedquantity-error" className="create-customer-order-error-text">
                    {errors.orderedQuantity}
                  </p>
                )}
                {selectedProduct && (
                  <small className="quantity-info">
                    Max available: {selectedProduct.quantity} {selectedProduct.unit || 'units'}
                  </small>
                )}
              </div>

              <div className="create-customer-order-form-group">
                <label htmlFor="payment">Payment Method</label>
                <select
                  id="payment"
                  name="payment"
                  value={formData.payment}
                  onChange={handleChange}
                  aria-invalid={!!errors.payment}
                  aria-describedby={errors.payment ? "payment-error" : undefined}
                  className="create-customer-order-select"
                >
                  <option value="credit">Credit</option>
                  <option value="cash">Cash</option>
                </select>
                {errors.payment && (
                  <p id="payment-error" className="create-customer-order-error-text">
                    {errors.payment}
                  </p>
                )}
              </div>
            </div>

            <div className="create-customer-order-form-group">
              <label htmlFor="remarks">Remarks / Special Instructions (optional)</label>
              <textarea
                id="remarks"
                name="remarks"
                value={formData.remarks}
                onChange={handleChange}
                rows="3"
                placeholder="Any special notes, delivery instructions, etc..."
                className="create-customer-order-textarea"
              />
            </div>

            {errors.submit && (
              <div className="create-customer-order-error-banner" role="alert">
                {errors.submit}
              </div>
            )}

            <button
              type="submit"
              className="create-customer-order-submit-button"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? 'Creating Order...' : 'Create Order'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateCustomerOrder;