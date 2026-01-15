// User.jsx
import React, { useEffect, useState, useCallback } from 'react';
import Header from '../../components/layout/Header/Header';
import Sidebar from '../../components/layout/Sidebar/Sidebar';
import './User.css';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

const User = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: ''
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEdit, setIsEdit] = useState(false);
  const [userId, setUserId] = useState(null);
  const [roles, setRoles] = useState([]);
  
  const backendUrl = process.env.REACT_APP_BACKEND_IP;
  const navigate = useNavigate();
  const location = useLocation();

  const validateForm = () => {
    const newErrors = {};

    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    } else if (formData.username.trim().length < 3) {
      newErrors.username = 'Username must be at least 3 characters long';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please provide a valid email';
    }

    // Password is only required for new users, not for updates
    if (!isEdit && !formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password && formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters long';
    }

    if (!formData.role) {
      newErrors.role = 'Role is required';
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
        // Update existing user
        await axios.put(`${backendUrl}/api/users/updateUser/${userId}`, {
          username: formData.username,
          email: formData.email,
          role: formData.role
        }, config);
      } else {
        // Create new user
        await axios.post(`${backendUrl}/api/users/createUser`, {
          username: formData.username,
          email: formData.email,
          password: formData.password,
          role: formData.role
        }, config);
      }

      setIsSuccess(true);
      setTimeout(() => {
        navigate('/userlist');
      }, 1500);
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Something went wrong. Please try again.';
      setErrors({ submit: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch roles from backend - wrapped in useCallback
  const fetchRoles = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backendUrl}/api/roles/getAllRoles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRoles(response.data);
    } catch (error) {
      console.error("Failed to fetch roles:", error);
    }
  }, [backendUrl]); // Add backendUrl as dependency

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]); // Include fetchRoles in dependencies

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const editId = searchParams.get('edit');

    if (editId) {
      const loadUserForEdit = async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await axios.get(`${backendUrl}/api/users/getAllUsers`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          const users = response.data;
          const userToEdit = users.find(u => u._id === editId);

          if (userToEdit) {
            setFormData({
              username: userToEdit.username,
              email: userToEdit.email,
              password: '', // Don't pre-fill password
              role: userToEdit.role
            });
            setIsEdit(true);
            setUserId(editId);
          } else {
            navigate('/userlist');
          }
        } catch (error) {
          console.error("Failed to fetch user data for edit", error);
          navigate('/userlist');
        }
      };

      loadUserForEdit();
    }
  }, [location.search, navigate, backendUrl]);

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
    return <div className="loading">Loading user information...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div className="user-registration-layout">
      <Header 
        sidebarOpen={sidebarOpen} 
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
        user={user}
      />
      <Sidebar 
        isOpen={sidebarOpen} 
        activeItem="Users" 
        onSetActiveItem={() => {}} 
        onClose={() => setSidebarOpen(false)}
        user={user}
      />
      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="registration-card">
          <h1>{isEdit ? 'Edit User' : 'Create New User'}</h1>
          {isSuccess && (
            <div className="success-message" role="alert">
              {isEdit ? 'User updated successfully!' : 'User created successfully!'}
            </div>
          )}
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="username">Full Name</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  value={formData.username}
                  onChange={handleChange}
                  aria-invalid={!!errors.username}
                  aria-describedby={errors.username ? "username-error" : undefined}
                />
                {errors.username && (
                  <p id="username-error" className="error-text" role="alert">
                    {errors.username}
                  </p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                />
                {errors.email && (
                  <p id="email-error" className="error-text" role="alert">
                    {errors.email}
                  </p>
                )}
              </div>
            </div>

            {!isEdit && (
              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "password-error" : undefined}
                />
                {errors.password && (
                  <p id="password-error" className="error-text" role="alert">
                    {errors.password}
                  </p>
                )}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="role">Role</label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                aria-invalid={!!errors.role}
                aria-describedby={errors.role ? "role-error" : undefined}
              >
                <option value="">Select a role</option>
                {roles.map(role => (
                  <option key={role._id} value={role.name}>
                    {role.name}
                  </option>
                ))}
              </select>
              {errors.role && (
                <p id="role-error" className="error-text" role="alert">
                  {errors.role}
                </p>
              )}
            </div>

            {errors.submit && (
              <div className="error-banner" role="alert">
                {errors.submit}
              </div>
            )}

            <button
              type="submit"
              className="submit-button"
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update User' : 'Create User')}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default User;