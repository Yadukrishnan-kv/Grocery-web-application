// src/pages/Products/CategoryList/CategoryList.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './CategoryList.css';
import axios from 'axios';
import toast from 'react-hot-toast'; // ← NEW IMPORT

const CategoryList = () => {
  const [categories, setCategories] = useState([]);
  const [filteredCategories, setFilteredCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Products');
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // NEW: Confirmation modal for delete
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);

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
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/categories/getallcategories`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCategories(response.data);
      setFilteredCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast.error("Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredCategories(categories);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const filtered = categories.filter(category =>
      category.CategoryName?.toLowerCase().includes(query)
    );
    setFilteredCategories(filtered);
  }, [searchQuery, categories]);

  useEffect(() => {
    fetchCurrentUser();
    fetchCategories();
  }, [fetchCurrentUser, fetchCategories]);

  const handleDeleteClick = (id, categoryName) => {
    setCategoryToDelete({ id, categoryName });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!categoryToDelete) return;

    setShowDeleteModal(false);

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${backendUrl}/api/categories/deletecategory/${categoryToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success(`Category "${categoryToDelete.categoryName}" deleted successfully!`);
      fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error("Failed to delete category. Please try again.");
    } finally {
      setCategoryToDelete(null);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
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

              <div className="category-list-controls-group">
                <div className="category-list-search-container">
                  <input
                    type="text"
                    className="category-list-search-input"
                    placeholder="Search by category name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search categories"
                  />
                  {searchQuery && (
                    <button
                      className="category-list-search-clear"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                <Link to="/category/create" className="category-list-create-button">
                  Create Category
                </Link>
              </div>
            </div>
            
            {loading ? (
              <div className="category-list-loading">Loading categories...</div>
            ) : filteredCategories.length === 0 ? (
              <div className="category-list-no-data">
                No categories found {searchQuery.trim() ? `matching "${searchQuery}"` : ''}
              </div>
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
                    {filteredCategories.map((category, index) => (
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
                            onClick={() => handleDeleteClick(category._id, category.CategoryName)}
                            aria-label={`Delete category ${category.CategoryName}`}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Confirmation Modal for Delete */}
      {showDeleteModal && categoryToDelete && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <h3 className="confirm-title">Confirm Delete Category</h3>
            <p className="confirm-text">
              Are you sure you want to delete category <strong>"{categoryToDelete.categoryName}"</strong>?
            </p>
            <p className="confirm-warning">This action cannot be undone.</p>
            <div className="confirm-actions">
              <button
                className="confirm-cancel"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                className="confirm-delete"
                onClick={confirmDelete}
              >
                Delete Category
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryList;