// src/context/AppSettingsContext.js
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const DEFAULT_ENTRIES_PER_PAGE = 10;

const AppSettingsContext = createContext();

export const useAppSettings = () => {
  const context = useContext(AppSettingsContext);
  if (!context) {
    throw new Error('useAppSettings must be used within AppSettingsProvider');
  }
  return context;
};

export const AppSettingsProvider = ({ children }) => {
  const [entriesPerPage, setEntriesPerPage] = useState(DEFAULT_ENTRIES_PER_PAGE);
  const [invoiceSystemActive, setInvoiceSystemActive] = useState(true);
  const [loading, setLoading] = useState(true);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const loadSettings = useCallback(async () => {
    const token = localStorage.getItem('token');

    if (!token) {
      setEntriesPerPage(DEFAULT_ENTRIES_PER_PAGE);
      setInvoiceSystemActive(true);
      setLoading(false);
      return;
    }

    try {
      const [settingsRes, invoiceStatusRes] = await Promise.all([
        axios.get(`${backendUrl}/api/settings/company-settings`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${backendUrl}/api/settings/invoice-status`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch((error) => {
          console.error('Failed to load invoice status:', error);
          return { data: { invoiceSystemActive: true } };
        })
      ]);

      setEntriesPerPage(settingsRes.data?.entriesPerPage || DEFAULT_ENTRIES_PER_PAGE);
      setInvoiceSystemActive(invoiceStatusRes.data?.invoiceSystemActive !== false);
    } catch (error) {
      console.error('Failed to load app settings:', error);
      setEntriesPerPage(DEFAULT_ENTRIES_PER_PAGE);
      setInvoiceSystemActive(true);
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return (
    <AppSettingsContext.Provider value={{
      entriesPerPage,
      invoiceSystemActive,
      loading,
      reloadSettings: loadSettings
    }}>
      {children}
    </AppSettingsContext.Provider>
  );
};
