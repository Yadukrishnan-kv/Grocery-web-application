// src/context/PermissionContext.js
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const PermissionContext = createContext();

export const usePermissions = () => {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermissions must be used within PermissionProvider');
  }
  return context;
};

// Define all possible permissions
const ALL_PERMISSIONS = [
  "menu.dashboard",
  "menu.users",
  "menu.users.list",
  "menu.users.roles", 
  "menu.products",
  "menu.products.category",
  "menu.products.subcategory",
  "menu.products.add",
  "menu.orders",
  "menu.settings"
];

export const PermissionProvider = ({ children }) => {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userRole, setUserRole] = useState(null);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const loadPermissions = useCallback(async () => {
    const token = localStorage.getItem('token');
    
    if (!token) {
      setPermissions([]);
      setLoading(false);
      return;
    }

    try {
      setError(null);
      
      // First, get user info to check role
      const userResponse = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const role = userResponse.data.user?.role || userResponse.data.role;
      setUserRole(role);
      
      // If user is Admin, grant all permissions
      if (role === 'Admin') {
        setPermissions(ALL_PERMISSIONS);
        setLoading(false);
        return;
      }
      
      // For other roles, fetch permissions
      const response = await axios.get(`${backendUrl}/api/roles/my-permissions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setPermissions(response.data.permissions || []);
    } catch (error) {
      console.error('Failed to load permissions:', error);
      
      if (error.response?.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/login';
      } else {
        // Default to no permissions on error
        setPermissions([]);
      }
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const hasPermission = (permission) => {
    if (loading) return true; // Allow during loading
    if (userRole === 'Admin') return true; // Admin has all permissions
    return permissions.includes(permission);
  };

  return (
    <PermissionContext.Provider value={{
      permissions,
      loading,
      error,
      hasPermission,
      reloadPermissions: loadPermissions,
      userRole
    }}>
      {children}
    </PermissionContext.Provider>
  );
};