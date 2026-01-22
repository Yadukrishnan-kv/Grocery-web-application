// src/pages/Category/CategoryList.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './CategoryList.css';
import axios from 'axios';

const CategoryList = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Products');
  const [user, setUser] = useState(null);

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

  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch(`${backendUrl}/api/categories/getallcategories`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch categories');
      
      const data = await response.json();
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchCategories();
  }, [fetchCurrentUser, fetchCategories]);

  const handleDelete = async (id, categoryName) => {
    if (window.confirm(`Are you sure you want to delete category "${categoryName}"?`)) {
      try {
        const response = await fetch(`${backendUrl}/api/categories/deletecategory/${id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (!response.ok) throw new Error('Failed to delete category');
        
        fetchCategories();
      } catch (error) {
        console.error('Error deleting category:', error);
        alert('Failed to delete category. Please try again.');
      }
    }
  };

  if (!user) {
    return <div className="category-list-loading">Loading...</div>;
  }

  return (
    <div className="category-list-layout">
      <Header 
        sidebarOpen={sidebarOpen} 
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
        user={user}
      />
      <Sidebar 
        isOpen={sidebarOpen} 
        activeItem={activeItem} 
        onSetActiveItem={setActiveItem}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main className={`category-list-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="category-list-container-wrapper">
          <div className="category-list-container">
            <div className="category-list-header-section">
              <h2 className="category-list-page-title">Category Management</h2>
              <Link to="/category/create" className="category-list-create-button">
                Create Category
              </Link>
            </div>
            
            {loading ? (
              <div className="category-list-loading">Loading categories...</div>
            ) : (
              <div className="category-list-table-wrapper">
                <table className="category-list-data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Category Name</th>
                      <th scope="col">Edit</th>
                      <th scope="col">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.length > 0 ? (
                      categories.map((category, index) => (
                        <tr key={category._id}>
                          <td>{index + 1}</td>
                          <td>{category.CategoryName}</td>
                          <td>
                            <Link
                              to={`/category/create?edit=${category._id}`}
                              className="category-list-icon-button category-list-edit-button"
                              aria-label={`Edit category ${category.CategoryName}`}
                            >
                              ✎
                            </Link>
                          </td>
                          <td>
                            <button
                              className="category-list-icon-button category-list-delete-button"
                              onClick={() => handleDelete(category._id, category.CategoryName)}
                              aria-label={`Delete category ${category.CategoryName}`}
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" className="category-list-no-data">
                          No categories found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default CategoryList;