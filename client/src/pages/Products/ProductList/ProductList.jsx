// src/pages/Products/ProductList/ProductList.jsx
import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import "./ProductList.css";
import axios from "axios";
import toast from 'react-hot-toast'; // ← NEW IMPORT

const ProductList = () => {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Products");
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // NEW: Confirmation modal for delete
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);

  const backendUrl = process.env.REACT_APP_BACKEND_IP;

  const fetchCurrentUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        window.location.href = "/login";
        return;
      }

      const response = await axios.get(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data.user || response.data);
    } catch (error) {
      console.error("Failed to load user", error);
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
  }, [backendUrl]);

  const fetchProducts = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/products/getallproducts`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setProducts(response.data);
      setFilteredProducts(response.data);
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  const fetchCategories = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/categories/getallcategories`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setCategories(response.data);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  }, [backendUrl]);

  useEffect(() => {
    fetchCurrentUser();
    fetchProducts();
    fetchCategories();
  }, [fetchCurrentUser, fetchProducts, fetchCategories]);

  useEffect(() => {
    let result = products;

    if (selectedCategory !== "All") {
      result = result.filter(
        (product) => product.CategoryName === selectedCategory
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((product) =>
        product.productName?.toLowerCase().includes(query)
      );
    }

    setFilteredProducts(result);
  }, [selectedCategory, searchQuery, products]);

  const handleDeleteClick = (id, productName) => {
    setProductToDelete({ id, productName });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;

    setShowDeleteModal(false);

    try {
      const token = localStorage.getItem("token");
      await axios.delete(
        `${backendUrl}/api/products/deleteproduct/${productToDelete.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      toast.success(
        `Product "${productToDelete.productName}" deleted successfully!`
      );
      fetchProducts();
    } catch (error) {
      console.error("Error deleting product:", error);
      toast.error("Failed to delete product. Please try again.");
    } finally {
      setProductToDelete(null);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
  };

  if (!user) {
    return <div className="product-list-loading">Loading...</div>;
  }

  return (
    <div className="product-list-layout">
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
      <main
        className={`product-list-main-content ${sidebarOpen ? "sidebar-open" : ""}`}
      >
        <div className="product-list-container-wrapper">
          <div className="product-list-container">
            <div className="product-list-header-section">
              <h2 className="product-list-page-title">Product Management</h2>

              <div className="product-list-controls-group">
                <div className="product-list-filter-group">
                  <label
                    htmlFor="categoryFilter"
                    className="product-list-filter-label"
                  >
                    Filter by Category:
                  </label>
                  <select
                    id="categoryFilter"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="product-list-category-filter"
                  >
                    <option value="All">All Categories</option>
                    {categories.map((cat) => (
                      <option key={cat._id} value={cat.CategoryName}>
                        {cat.CategoryName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="product-list-search-container">
                  <input
                    type="text"
                    className="product-list-search-input"
                    placeholder="Search by product name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search products"
                  />
                  {searchQuery && (
                    <button
                      className="product-list-search-clear"
                      onClick={clearSearch}
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                <Link
                  to="/product/create"
                  className="product-list-create-button"
                >
                  Create Product
                </Link>
              </div>
            </div>

            {loading ? (
              <div className="product-list-loading">Loading products...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="product-list-no-data">
                No products found
                {selectedCategory !== "All" ? ` in "${selectedCategory}"` : ""}
                {searchQuery.trim() ? ` matching "${searchQuery}"` : ""}
              </div>
            ) : (
              <div className="product-list-table-wrapper">
                <table className="product-list-data-table">
                  <thead>
                    <tr>
                      <th scope="col">No</th>
                      <th scope="col">Product Name</th>
                      <th scope="col">Category</th>
                      <th scope="col">Sub-Category</th>
                      <th scope="col">Price (AED)</th>
                      <th scope="col">Quantity</th>
                      <th scope="col">Unit</th>
                      <th scope="col">Edit</th>
                      <th scope="col">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product, index) => (
                      <tr key={product._id}>
                        <td>{index + 1}</td>
                        <td>{product.productName}</td>
                        <td>{product.CategoryName}</td>
                        <td>{product.subCategoryName}</td>
                        <td>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <img
                              src={DirhamSymbol}
                              alt="Dirham Symbol"
                              width={15}
                              height={15}
                              style={{
                                paddingTop: "3px",
                              }}
                            />
                            <span>{product.price.toFixed(2)}</span>
                          </div>
                        </td>

                        <td>{product.quantity}</td>
                        <td>{product.unit || "N/A"}</td>
                        <td>
                          <Link
                            to={`/product/create?edit=${product._id}`}
                            className="product-list-icon-button product-list-edit-button"
                            aria-label={`Edit product ${product.productName}`}
                          >
                            ✎
                          </Link>
                        </td>
                        <td>
                          <button
                            className="product-list-icon-button product-list-delete-button"
                            onClick={() =>
                              handleDeleteClick(product._id, product.productName)
                            }
                            aria-label={`Delete product ${product.productName}`}
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
      {showDeleteModal && productToDelete && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <h3 className="confirm-title">Delete Product</h3>
            <p className="confirm-text">
              Are you sure you want to delete 
              <strong> "{productToDelete.productName}"</strong>?
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
                Delete Product
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductList;