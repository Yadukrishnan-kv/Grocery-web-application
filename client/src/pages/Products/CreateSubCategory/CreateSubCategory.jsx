// CreateSubCategory.jsx
import React, { useEffect, useState, useCallback } from 'react';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './CreateSubCategory.css';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

const CreateSubCategory = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [formData, setFormData] = useState({
    CategoryName: '',
    subCategoryName: ''
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEdit, setIsEdit] = useState(false);
  const [subCategoryId, setSubCategoryId] = useState(null);
  const [categories, setCategories] = useState([]);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();
  const location = useLocation();

  const validateForm = () => {
    const newErrors = {};

    if (!formData.CategoryName.trim()) {
      newErrors.CategoryName = 'Category name is required';
    }

    if (!formData.subCategoryName.trim()) {
      newErrors.subCategoryName = 'Sub-category name is required';
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

      if (isEdit) {
        await axios.put(`${backendUrl}/api/subcategories/updatesubcategory/${subCategoryId}`, {
          CategoryName: formData.CategoryName,
          subCategoryName: formData.subCategoryName
        }, config);
      } else {
        await axios.post(`${backendUrl}/api/subcategories/createsubcategory`, {
          CategoryName: formData.CategoryName,
          subCategoryName: formData.subCategoryName
        }, config);
      }

      setIsSuccess(true);
      setTimeout(() => {
        navigate('/subcategory/list');
      }, 1500);
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Something went wrong. Please try again.';
      setErrors({ submit: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSubCategoryData = useCallback(async (id) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/subcategories/getallsubcategories`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const subCategories = response.data;
      const subCategoryToEdit = subCategories.find(sc => sc._id === id);

      if (subCategoryToEdit) {
        setFormData({
          CategoryName: subCategoryToEdit.CategoryName,
          subCategoryName: subCategoryToEdit.subCategoryName
        });
        setIsEdit(true);
        setSubCategoryId(id);
      } else {
        navigate('/subcategory/list');
      }
    } catch (error) {
      console.error("Failed to fetch sub-category data", error);
      navigate('/subcategory/list');
    }
  }, [backendUrl, navigate]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${backendUrl}/api/categories/getallcategories`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCategories(response.data);
      } catch (error) {
        console.error("Failed to fetch categories", error);
      }
    };

    loadCategories();
  }, [backendUrl]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const editId = searchParams.get('edit');

    if (editId) {
      fetchSubCategoryData(editId);
    }
  }, [location.search, fetchSubCategoryData]);

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
    return <div className="subcategory-loading">Loading user information...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="subcategory-form-layout">
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
      <main className={`subcategory-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="subcategory-form-card">
          <h1>{isEdit ? 'Edit Sub-Category' : 'Create New Sub-Category'}</h1>
          {isSuccess && (
            <div className="subcategory-success-message" role="alert">
              {isEdit ? 'Sub-category updated successfully!' : 'Sub-category created successfully!'}
            </div>
          )}
          <form onSubmit={handleSubmit} noValidate>
            <div className="subcategory-form-group">
              <label htmlFor="CategoryName">Category Name</label>
              <select
                id="CategoryName"
                name="CategoryName"
                value={formData.CategoryName}
                onChange={handleChange}
                aria-invalid={!!errors.CategoryName}
                aria-describedby={errors.CategoryName ? "categoryname-error" : undefined}
                className="subcategory-select"
              >
                <option value="">Select a category</option>
                {categories.map(category => (
                  <option key={category._id} value={category.CategoryName}>
                    {category.CategoryName}
                  </option>
                ))}
              </select>
              {errors.CategoryName && (
                <p id="categoryname-error" className="subcategory-error-text" role="alert">
                  {errors.CategoryName}
                </p>
              )}
            </div>

            <div className="subcategory-form-group">
              <label htmlFor="subCategoryName">Sub-Category Name</label>
              <input
                id="subCategoryName"
                name="subCategoryName"
                type="text"
                value={formData.subCategoryName}
                onChange={handleChange}
                aria-invalid={!!errors.subCategoryName}
                aria-describedby={errors.subCategoryName ? "subcategoryname-error" : undefined}
                className="subcategory-input"
              />
              {errors.subCategoryName && (
                <p id="subcategoryname-error" className="subcategory-error-text" role="alert">
                  {errors.subCategoryName}
                </p>
              )}
            </div>

            {errors.submit && (
              <div className="subcategory-error-banner" role="alert">
                {errors.submit}
              </div>
            )}

            <button
              type="submit"
              className="subcategory-submit-button"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update Sub-Category' : 'Create Sub-Category')}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateSubCategory;