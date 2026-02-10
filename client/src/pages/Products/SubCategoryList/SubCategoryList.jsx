// src/pages/SubCategory/SubCategoryList.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './SubCategoryList.css';
import axios from 'axios';
import toast from 'react-hot-toast';

const SubCategoryList = () => {
  const [subCategories, setSubCategories] = useState([]);
  const [filteredSubCategories, setFilteredSubCategories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Products');
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Confirmation modal for delete
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [subCatToDelete, setSubCatToDelete] = useState(null);

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
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }, [backendUrl]);

  const fetchSubCategories = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/subcategories/getallsubcategories`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSubCategories(response.data);
      setFilteredSubCategories(response.data);
    } catch (error) {
      console.error('Error fetching sub-categories:', error);
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    let result = subCategories;

    if (selectedCategory !== 'All') {
      result = result.filter(subCat => subCat.CategoryName === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(subCat =>
        subCat.subCategoryName?.toLowerCase().includes(query)
      );
    }

    setFilteredSubCategories(result);
  }, [selectedCategory, searchQuery, subCategories]);

  useEffect(() => {
    fetchCurrentUser();
    fetchCategories();
    fetchSubCategories();
  }, [fetchCurrentUser, fetchCategories, fetchSubCategories]);

  const handleDeleteClick = (id, subCategoryName) => {
    setSubCatToDelete({ id, subCategoryName });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!subCatToDelete) return;

    setShowDeleteModal(false);

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${backendUrl}/api/subcategories/deletesubcategory/${subCatToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      toast.success(`Sub-category "${subCatToDelete.subCategoryName}" deleted successfully!`);
      fetchSubCategories();
    } catch (error) {
      console.error('Error deleting sub-category:', error);
      toast.error("Failed to delete sub-category. Please try again.");
    } finally {
      setSubCatToDelete(null);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  if (!user) {
    return <div className="subcategory-list-loading">Loading...</div>;
  }

  return (
    <div className="subcategory-list-layout">
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
      <main className={`subcategory-list-main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="subcategory-list-container-wrapper">
          <div className="subcategory-list-container">
            <div className="subcategory-list-header-section">
              <h2 className="subcategory-list-page-title">Sub-Category Management</h2>

              <div className="subcategory-list-controls-group">
                <div className="subcategory-list-filter-group">
                  <label htmlFor="categoryFilter" className="subcategory-list-filter-label">
                    Filter by Category:
                  </label>
                  <select
                    id="categoryFilter"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="subcategory-list-category-filter"
                  >
                    <option value="All">All Categories</option>
                    {categories.map(cat => (
                      <option key={cat._id} value={cat.CategoryName}>
                        {cat.CategoryName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="subcategory-list-search-container">
                  <input
                    type="text"
                    className="subcategory-list-search-input"
                    placeholder="Search by sub-category name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search sub-categories"
                  />
                  {searchQuery && (
                    <button
                      className="subcategory-list-search-clear"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                <Link to="/subcategory/create" className="subcategory-list-create-button">
                  Create Sub-Category
                </Link>
              </div>
            </div>
            
            {loading ? (
              <div className="subcategory-list-loading">Loading sub-categories...</div>
            ) : filteredSubCategories.length === 0 ? (
              <div className="subcategory-list-no-data">
                No sub-categories found
                {selectedCategory !== 'All' ? ` in "${selectedCategory}"` : ''}
                {searchQuery.trim() ? ` matching "${searchQuery}"` : ''}
              </div>
            ) : (
              <div className="subcategory-list-table-wrapper">
                <table className="subcategory-list-data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Sub-Category Name</th>
                      <th scope="col">Category</th>
                      <th scope="col">Edit</th>
                      <th scope="col">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubCategories.map((subCat, index) => (
                      <tr key={subCat._id}>
                        <td>{index + 1}</td>
                        <td>{subCat.subCategoryName}</td>
                        <td>{subCat.CategoryName}</td>
                        <td>
                          <Link
                            to={`/subcategory/create?edit=${subCat._id}`}
                            className="subcategory-list-icon-button subcategory-list-edit-button"
                            aria-label={`Edit sub-category ${subCat.subCategoryName}`}
                          >
                            ✎
                          </Link>
                        </td>
                        <td>
                          <button
                            className="subcategory-list-icon-button subcategory-list-delete-button"
                            onClick={() => handleDeleteClick(subCat._id, subCat.subCategoryName)}
                            aria-label={`Delete sub-category ${subCat.subCategoryName}`}
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

      {/* Responsive Delete Confirmation Modal */}
      {showDeleteModal && subCatToDelete && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <h3 className="confirm-title">Delete Sub-Category</h3>
            <p className="confirm-text">
              Are you sure you want to delete 
              <strong> "{subCatToDelete.subCategoryName}"</strong>?
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
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubCategoryList;