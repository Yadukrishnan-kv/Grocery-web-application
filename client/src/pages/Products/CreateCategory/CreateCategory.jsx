// src/pages/Products/CreateCategory/CreateCategory.jsx
import React, { useEffect, useState, useCallback } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './CreateCategory.css';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast'; // ← NEW IMPORT

const CreateCategory = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [formData, setFormData] = useState({
    CategoryName: ''
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEdit, setIsEdit] = useState(false);
  const [categoryId, setCategoryId] = useState(null);
  
  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();
  const location = useLocation();

  const validateForm = () => {
    const newErrors = {};

    if (!formData.CategoryName.trim()) {
      newErrors.CategoryName = 'Category name is required';
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

      if (isEdit) {
        await axios.put(`${backendUrl}/api/categories/updatecategory/${categoryId}`, {
          CategoryName: formData.CategoryName
        }, config);

        toast.success('Category updated successfully!');
      } else {
        await axios.post(`${backendUrl}/api/categories/createcategory`, {
          CategoryName: formData.CategoryName
        }, config);

        toast.success('Category created successfully!');
      }

      // Navigate after short delay so user sees the success toast
      setTimeout(() => {
        navigate('/category/list');
      }, 1500);
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Something went wrong. Please try again.';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCategoryData = useCallback(async (id) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/categories/getallcategories`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const categories = response.data;
      const categoryToEdit = categories.find(c => c._id === id);
      
      if (categoryToEdit) {
        setFormData({
          CategoryName: categoryToEdit.CategoryName
        });
        setIsEdit(true);
        setCategoryId(id);
      } else {
        navigate('/category/list');
      }
    } catch (error) {
      console.error("Failed to fetch category data", error);
      toast.error("Failed to load category data");
      navigate('/category/list');
    }
  }, [backendUrl, navigate]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const editId = searchParams.get('edit');
    
    if (editId) {
      fetchCategoryData(editId);
    }
  }, [location.search, fetchCategoryData]);

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
    return <div className="category-loading">Loading user information...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="category-form-layout">
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
      <main className={`category-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="category-form-card">
          <h1>{isEdit ? 'Edit Category' : 'Create New Category'}</h1>

          <form onSubmit={handleSubmit} noValidate>
            <div className="category-form-group">
              <label htmlFor="CategoryName">Category Name</label>
              <input
                id="CategoryName"
                name="CategoryName"
                type="text"
                value={formData.CategoryName}
                onChange={handleChange}
                aria-invalid={!!errors.CategoryName}
                aria-describedby={errors.CategoryName ? "categoryname-error" : undefined}
              />
              {errors.CategoryName && (
                <p id="categoryname-error" className="category-error-text" role="alert">
                  {errors.CategoryName}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="category-submit-button"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update Category' : 'Create Category')}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateCategory;