// SubCategoryList.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../../components/layout/Header/Header';
import Sidebar from '../../../components/layout/Sidebar/Sidebar';
import './SubCategoryList.css';
import axios from 'axios';

const SubCategoryList = () => {
  const [subCategories, setSubCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState('Products');
  const [user, setUser] = useState(null); // Add user state

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  // Fetch current user for header
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

  // Wrap fetchSubCategories in useCallback
  const fetchSubCategories = useCallback(async () => {
    try {
      const response = await fetch(`${backendUrl}/api/subcategories/getallsubcategories`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch sub-categories');
      
      const data = await response.json();
      setSubCategories(data);
    } catch (error) {
      console.error('Error fetching sub-categories:', error);
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchSubCategories();
  }, [fetchCurrentUser, fetchSubCategories]);

  const handleDelete = async (id, subCategoryName) => {
    if (window.confirm(`Are you sure you want to delete sub-category "${subCategoryName}"?`)) {
      try {
        const response = await fetch(`${backendUrl}/api/subcategories/deletesubcategory/${id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (!response.ok) throw new Error('Failed to delete sub-category');
        
        fetchSubCategories();
      } catch (error) {
        console.error('Error deleting sub-category:', error);
        alert('Failed to delete sub-category. Please try again.');
      }
    }
  };

  if (!user) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="subcategory-list-layout">
      <Header 
        sidebarOpen={sidebarOpen} 
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
        user={user} // Pass user to Header
      />
      <Sidebar 
        isOpen={sidebarOpen} 
        activeItem={activeItem} 
        onSetActiveItem={setActiveItem}
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="table-container">
          <div className="table-header">
            <h2>Sub-Category Management</h2>
            <Link to="/subcategory/create" className="create-button">
              Create Sub-Category
            </Link>
          </div>
          
          {loading ? (
            <div className="loading">Loading sub-categories...</div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">No</th>
                    <th scope="col">Category Name</th>
                    <th scope="col">Sub-Category Name</th>
                    <th scope="col">Edit</th>
                    <th scope="col">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {subCategories.length > 0 ? (
                    subCategories.map((subCategory, index) => (
                      <tr key={subCategory._id}>
                        <td>{index + 1}</td>
                        <td>{subCategory.CategoryName}</td>
                        <td>{subCategory.subCategoryName}</td>
                        <td>
                          <Link
                            to={`/subcategory/create?edit=${subCategory._id}`}
                            className="icon-button edit-button"
                            aria-label={`Edit sub-category ${subCategory.subCategoryName}`}
                          >
                            ✎
                          </Link>
                        </td>
                        <td>
                          <button
                            className="icon-button delete-button"
                            onClick={() => handleDelete(subCategory._id, subCategory.subCategoryName)}
                            aria-label={`Delete sub-category ${subCategory.subCategoryName}`}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="no-data">
                        No sub-categories found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default SubCategoryList;