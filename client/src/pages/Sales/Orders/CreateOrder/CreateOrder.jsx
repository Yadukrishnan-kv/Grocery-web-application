// src/pages/Order/CreateOrder.jsx
import React, { useEffect, useState, useCallback } from 'react';
import Header from '../../../../components/layout/Header/Header';
import Sidebar from '../../../../components/layout/Sidebar/Sidebar';
import './CreateOrder.css';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast'; // ← NEW IMPORT

const CreateOrder = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [formData, setFormData] = useState({
    customerId: '',
    productId: '',
    orderedQuantity: '',
    payment: 'credit',
    remarks: ''
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEdit, setIsEdit] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedProductUnit, setSelectedProductUnit] = useState('');

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();
  const location = useLocation();

  const validateForm = () => {
    const newErrors = {};

    if (!formData.customerId) {
      newErrors.customerId = 'Customer is required';
    }

    if (!formData.productId) {
      newErrors.productId = 'Product is required';
    }

    if (!formData.orderedQuantity || isNaN(formData.orderedQuantity) || parseInt(formData.orderedQuantity) < 1) {
      newErrors.orderedQuantity = 'Valid ordered quantity is required';
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
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }

    if (name === 'productId') {
      const selected = products.find(p => p._id === value);
      setSelectedProductUnit(selected ? selected.unit : '');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

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

      const submitData = {
        customerId: formData.customerId,
        productId: formData.productId,
        orderedQuantity: parseInt(formData.orderedQuantity),
        payment: formData.payment,
        remarks: formData.remarks.trim()
      };

      if (isEdit) {
        toast.error('Order updates are not supported. Please create a new order.');
        return;
      } else {
        await axios.post(`${backendUrl}/api/orders/createorder`, submitData, config);
        toast.success('Order created successfully!');
      }

      setTimeout(() => {
        navigate('/order/list');
      }, 1500);
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Something went wrong. Please try again.';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchOrderData = useCallback(async (id) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/orders/getorderbyid/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const order = response.data;
      setFormData({
        customerId: order.customer?._id || '',
        productId: order.product?._id || '',
        orderedQuantity: order.orderedQuantity.toString(),
        payment: order.payment,
        remarks: order.remarks || ''
      });

      const selectedProduct = products.find(p => p._id === order.product?._id);
      setSelectedProductUnit(selectedProduct ? selectedProduct.unit : '');

      setIsEdit(true);
    } catch (error) {
      console.error("Failed to fetch order data", error);
      toast.error("Failed to load order data");
      navigate('/order/list');
    }
  }, [backendUrl, navigate, products]);

  const fetchCustomers = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/customers/getallcustomers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCustomers(response.data);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast.error("Failed to load customers");
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
      toast.error("Failed to load products");
    }
  }, [backendUrl]);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setUser(response.data.user || response.data);
    } catch (error) {
      console.error("Failed to load user", error);
      localStorage.removeItem('token');
      navigate('/login');
    } finally {
      setLoading(false);
    }
  }, [navigate, backendUrl]);

  useEffect(() => {
    fetchCustomers();
    fetchProducts();
  }, [fetchCustomers, fetchProducts]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const editId = searchParams.get('edit');
    
    if (editId) {
      fetchOrderData(editId);
    }
  }, [location.search, fetchOrderData]);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  if (loading) {
    return <div className="order-loading">Loading user information...</div>;
  }

  if (!user) {
    return null;
  }

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
      <main className={`order-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="order-form-card">
          <h1>{isEdit ? 'Edit Order' : 'Create New Order'}</h1>

          <form onSubmit={handleSubmit} noValidate>
            <div className="order-form-group">
              <label htmlFor="customerId">Customer</label>
              <select
                id="customerId"
                name="customerId"
                value={formData.customerId}
                onChange={handleChange}
                aria-invalid={!!errors.customerId}
                aria-describedby={errors.customerId ? "customerid-error" : undefined}
                className="order-select"
              >
                <option value="">Select a customer</option>
                {customers.map(customer => (
                  <option key={customer._id} value={customer._id}>
                    {customer.name}
                  </option>
                ))}
              </select>
              {errors.customerId && (
                <p id="customerid-error" className="order-error-text" role="alert">
                  {errors.customerId}
                </p>
              )}
            </div>

            <div className="order-form-group">
              <label htmlFor="productId">Product</label>
              <select
                id="productId"
                name="productId"
                value={formData.productId}
                onChange={handleChange}
                aria-invalid={!!errors.productId}
                aria-describedby={errors.productId ? "productid-error" : undefined}
                className="order-select"
              >
                <option value="">Select a product</option>
                {products.map(product => (
                  <option key={product._id} value={product._id}>
                    {product.productName} - AED {product.price.toFixed(2)} / {product.unit} 
                  </option>
                ))}
              </select>
              {errors.productId && (
                <p id="productid-error" className="order-error-text" role="alert">
                  {errors.productId}
                </p>
              )}
              {selectedProductUnit && (
                <small className="order-help-text">
                  Selected unit: {selectedProductUnit}
                </small>
              )}
            </div>

            <div className="order-form-row">
              <div className="order-form-group">
                <label htmlFor="orderedQuantity">
                  Quantity {selectedProductUnit ? `(in ${selectedProductUnit})` : ''}
                </label>
                <input
                  id="orderedQuantity"
                  name="orderedQuantity"
                  type="number"
                  min="1"
                  value={formData.orderedQuantity}
                  onChange={handleChange}
                  aria-invalid={!!errors.orderedQuantity}
                  aria-describedby={errors.orderedQuantity ? "orderedquantity-error" : undefined}
                  className="order-input"
                  placeholder={selectedProductUnit ? `e.g., 10 (for 10 ${selectedProductUnit})` : 'Enter quantity'}
                />
                {errors.orderedQuantity && (
                  <p id="orderedquantity-error" className="order-error-text" role="alert">
                    {errors.orderedQuantity}
                  </p>
                )}
                {selectedProductUnit && (
                  <small className="order-help-text">
                    Enter how many {selectedProductUnit} you want to order
                  </small>
                )}
              </div>

              <div className="order-form-group">
                <label htmlFor="payment">Payment Method</label>
                <select
                  id="payment"
                  name="payment"
                  value={formData.payment}
                  onChange={handleChange}
                  aria-invalid={!!errors.payment}
                  aria-describedby={errors.payment ? "payment-error" : undefined}
                  className="order-select"
                >
                  <option value="credit">Credit</option>
                  <option value="cash">Cash</option>
                </select>
                {errors.payment && (
                  <p id="payment-error" className="order-error-text" role="alert">
                    {errors.payment}
                  </p>
                )}
              </div>
            </div>

            <div className="order-form-group">
              <label htmlFor="remarks">Remarks / Comments (Optional)</label>
              <textarea
                id="remarks"
                name="remarks"
                rows="4"
                value={formData.remarks}
                onChange={handleChange}
                placeholder="Add any special instructions, delivery notes, or additional comments..."
                className="order-textarea"
              />
            </div>

            <button
              type="submit"
              className="order-submit-button"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update Order' : 'Create Order')}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateOrder;