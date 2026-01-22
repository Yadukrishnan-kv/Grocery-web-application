// CreateProduct.jsx
import React, { useEffect, useState, useCallback } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './CreateProduct.css';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

const CreateProduct = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [formData, setFormData] = useState({
    productName: '',
    CategoryName: '',
    subCategoryName: '',
    price: '',
    quantity: ''
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEdit, setIsEdit] = useState(false);
  const [productId, setProductId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();
  const location = useLocation();

  const validateForm = () => {
    const newErrors = {};

    if (!formData.productName.trim()) {
      newErrors.productName = 'Product name is required';
    }

    if (!formData.CategoryName) {
      newErrors.CategoryName = 'Category is required';
    }

    if (!formData.subCategoryName) {
      newErrors.subCategoryName = 'Sub-category is required';
    }

    if (!formData.price || isNaN(formData.price) || parseFloat(formData.price) <= 0) {
      newErrors.price = 'Valid price is required';
    }

    if (!formData.quantity || isNaN(formData.quantity) || parseInt(formData.quantity) < 0) {
      newErrors.quantity = 'Valid quantity is required';
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

      const submitData = {
        productName: formData.productName,
        CategoryName: formData.CategoryName,
        subCategoryName: formData.subCategoryName,
        price: parseFloat(formData.price),
        quantity: parseInt(formData.quantity)
      };

      if (isEdit) {
        await axios.put(`${backendUrl}/api/products/updateproduct/${productId}`, submitData, config);
      } else {
        await axios.post(`${backendUrl}/api/products/createproduct`, submitData, config);
      }

      setIsSuccess(true);
      setTimeout(() => {
        navigate('/product/list');
      }, 1500);
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Something went wrong. Please try again.';
      setErrors({ submit: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProductData = useCallback(async (id) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/products/getallproducts`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const products = response.data;
      const productToEdit = products.find(p => p._id === id);
      
      if (productToEdit) {
        setFormData({
          productName: productToEdit.productName,
          CategoryName: productToEdit.CategoryName,
          subCategoryName: productToEdit.subCategoryName,
          price: productToEdit.price.toString(),
          quantity: productToEdit.quantity.toString()
        });
        setIsEdit(true);
        setProductId(id);
      } else {
        navigate('/product/list');
      }
    } catch (error) {
      console.error("Failed to fetch product data", error);
      navigate('/product/list');
    }
  }, [backendUrl, navigate]);

  const fetchCategories = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/categories/getallcategories`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCategories(response.data);
    } catch (error) {
      console.error("Failed to fetch categories", error);
    }
  }, [backendUrl]);

  const fetchSubCategoriesByCategory = useCallback(async (categoryName) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/subcategories/getallsubcategories`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const filteredSubCategories = response.data.filter(sc => sc.CategoryName === categoryName);
      setSubCategories(filteredSubCategories);
      
      // If current subcategory is not in the new list, clear it
      if (formData.subCategoryName && !filteredSubCategories.some(sc => sc.subCategoryName === formData.subCategoryName)) {
        setFormData(prev => ({ ...prev, subCategoryName: '' }));
      }
    } catch (error) {
      console.error("Failed to fetch sub-categories", error);
    }
  }, [backendUrl, formData.subCategoryName]);

  // Fetch categories on mount
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Fetch product data when edit parameter changes
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const editId = searchParams.get('edit');
    
    if (editId) {
      fetchProductData(editId);
    }
  }, [location.search, fetchProductData]);

  // Fetch subcategories when category changes
  useEffect(() => {
    if (formData.CategoryName) {
      fetchSubCategoriesByCategory(formData.CategoryName);
    } else {
      setSubCategories([]);
      setFormData(prev => ({ ...prev, subCategoryName: '' }));
    }
  }, [formData.CategoryName, fetchSubCategoriesByCategory]);

  // Fetch current user
  useEffect(() => {
    const fetchCurrentUser = async () => {
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
    };

    fetchCurrentUser();
  }, [navigate, backendUrl]);

  if (loading) {
    return <div className="product-loading">Loading user information...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="product-form-layout">
      <Header 
        sidebarOpen={sidebarOpen} 
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
        user={user}
      />
      <Sidebar 
        isOpen={sidebarOpen} 
        activeItem="Products" 
        onSetActiveItem={() => {}} 
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main className={`product-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="product-form-card">
          <h1>{isEdit ? 'Edit Product' : 'Create New Product'}</h1>
          {isSuccess && (
            <div className="product-success-message" role="alert">
              {isEdit ? 'Product updated successfully!' : 'Product created successfully!'}
            </div>
          )}
          <form onSubmit={handleSubmit} noValidate>
            <div className="product-form-group">
              <label htmlFor="productName">Product Name</label>
              <input
                id="productName"
                name="productName"
                type="text"
                value={formData.productName}
                onChange={handleChange}
                aria-invalid={!!errors.productName}
                aria-describedby={errors.productName ? "productname-error" : undefined}
                className="product-input"
              />
              {errors.productName && (
                <p id="productname-error" className="product-error-text" role="alert">
                  {errors.productName}
                </p>
              )}
            </div>

            <div className="product-form-row">
              <div className="product-form-group">
                <label htmlFor="CategoryName">Category</label>
                <select
                  id="CategoryName"
                  name="CategoryName"
                  value={formData.CategoryName}
                  onChange={handleChange}
                  aria-invalid={!!errors.CategoryName}
                  aria-describedby={errors.CategoryName ? "categoryname-error" : undefined}
                  className="product-select"
                >
                  <option value="">Select a category</option>
                  {categories.map(category => (
                    <option key={category._id} value={category.CategoryName}>
                      {category.CategoryName}
                    </option>
                  ))}
                </select>
                {errors.CategoryName && (
                  <p id="categoryname-error" className="product-error-text" role="alert">
                    {errors.CategoryName}
                  </p>
                )}
              </div>

              <div className="product-form-group">
                <label htmlFor="subCategoryName">Sub-Category</label>
                <select
                  id="subCategoryName"
                  name="subCategoryName"
                  value={formData.subCategoryName}
                  onChange={handleChange}
                  disabled={!formData.CategoryName}
                  aria-invalid={!!errors.subCategoryName}
                  aria-describedby={errors.subCategoryName ? "subcategoryname-error" : undefined}
                  className="product-select"
                >
                  <option value="">Select a sub-category</option>
                  {subCategories.map(subCategory => (
                    <option key={subCategory._id} value={subCategory.subCategoryName}>
                      {subCategory.subCategoryName}
                    </option>
                  ))}
                </select>
                {errors.subCategoryName && (
                  <p id="subcategoryname-error" className="product-error-text" role="alert">
                    {errors.subCategoryName}
                  </p>
                )}
              </div>
            </div>

            <div className="product-form-row">
              <div className="product-form-group">
                <label htmlFor="price">Price ($)</label>
                <input
                  id="price"
                  name="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={handleChange}
                  aria-invalid={!!errors.price}
                  aria-describedby={errors.price ? "price-error" : undefined}
                  className="product-input"
                />
                {errors.price && (
                  <p id="price-error" className="product-error-text" role="alert">
                    {errors.price}
                  </p>
                )}
              </div>

              <div className="product-form-group">
                <label htmlFor="quantity">Quantity</label>
                <input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min="0"
                  value={formData.quantity}
                  onChange={handleChange}
                  aria-invalid={!!errors.quantity}
                  aria-describedby={errors.quantity ? "quantity-error" : undefined}
                  className="product-input"
                />
                {errors.quantity && (
                  <p id="quantity-error" className="product-error-text" role="alert">
                    {errors.quantity}
                  </p>
                )}
              </div>
            </div>

            {errors.submit && (
              <div className="product-error-banner" role="alert">
                {errors.submit}
              </div>
            )}

            <button
              type="submit"
              className="product-submit-button"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update Product' : 'Create Product')}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateProduct;