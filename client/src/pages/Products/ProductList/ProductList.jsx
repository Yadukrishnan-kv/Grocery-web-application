// src/pages/Products/ProductList/ProductList.jsx
import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import Header from "../../../components/layout/Header/Header";
import Sidebar from "../../../components/layout/Sidebar/Sidebar";
import DirhamSymbol from "../../../Assets/aed-symbol.png";
import TableScrollSync from "../../../components/common/TableScrollSync";
import "./ProductList.css";
import axios from "axios";
import toast from "../../../utils/toast";
import { useAppSettings } from "../../../context/AppSettingsContext";
import { usePaginatedData } from "../../../hooks/usePagination";
import Pagination from "../../../components/common/Pagination";

const ProductList = () => {
  // Full list — only fetched/used when a search or category filter is active,
  // so client-side filtering can search the whole dataset (not just one page).
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("Products");
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const { entriesPerPage } = useAppSettings();
  const isFiltering = selectedCategory !== "All" || searchQuery.trim() !== "";

  // Server-side pagination state (used when no filter/search is active)
  const [pageProducts, setPageProducts] = useState([]);
  const [serverPage, setServerPage] = useState(1);
  const [serverTotalPages, setServerTotalPages] = useState(1);
  const [serverTotalRecords, setServerTotalRecords] = useState(0);

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

  // Full unpaginated list — only needed while a search/category filter is active,
  // so filtering can search across the entire dataset rather than one page.
  const fetchAllProducts = useCallback(async () => {
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

  // Server-side paginated fetch — used for the default (unfiltered) browse view
  const fetchProductsPage = useCallback(
    async (page) => {
      try {
        setLoading(true);
        const token = localStorage.getItem("token");
        const response = await axios.get(
          `${backendUrl}/api/products/getallproducts`,
          {
            headers: { Authorization: `Bearer ${token}` },
            params: { page, limit: entriesPerPage },
          }
        );
        setPageProducts(response.data.data);
        setServerTotalPages(response.data.totalPages);
        setServerTotalRecords(response.data.totalRecords);
      } catch (error) {
        console.error("Error fetching products:", error);
        toast.error("Failed to load products");
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, entriesPerPage]
  );

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
    fetchCategories();
  }, [fetchCurrentUser, fetchCategories]);

  // Fetch the right dataset depending on whether a filter/search is active
  useEffect(() => {
    if (isFiltering) {
      fetchAllProducts();
    } else {
      fetchProductsPage(serverPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFiltering, serverPage, entriesPerPage]);

  // Reset to page 1 of the server view whenever filters are cleared
  useEffect(() => {
    if (!isFiltering) setServerPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFiltering]);

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

  const clientPagination = usePaginatedData(
    filteredProducts,
    entriesPerPage,
    `${selectedCategory}|${searchQuery}`
  );
  const serverPagination = {
    page: serverPage,
    totalPages: serverTotalPages,
    totalRecords: serverTotalRecords,
    showingFrom: serverTotalRecords === 0 ? 0 : (serverPage - 1) * entriesPerPage + 1,
    showingTo: Math.min(serverPage * entriesPerPage, serverTotalRecords),
    canPrev: serverPage > 1,
    canNext: serverPage < serverTotalPages,
    goPrev: () => setServerPage((p) => Math.max(1, p - 1)),
    goNext: () => setServerPage((p) => Math.min(serverTotalPages, p + 1)),
  };
  const visibleProducts = isFiltering ? clientPagination.pageData : pageProducts;
  const activePagination = isFiltering ? clientPagination : serverPagination;
  const refetchCurrent = () =>
    isFiltering ? fetchAllProducts() : fetchProductsPage(serverPage);

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
      refetchCurrent();
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
            ) : visibleProducts.length === 0 ? (
              <div className="product-list-no-data">
                No products found
                {selectedCategory !== "All" ? ` in "${selectedCategory}"` : ""}
                {searchQuery.trim() ? ` matching "${searchQuery}"` : ""}
              </div>
            ) : (
              <TableScrollSync>
                <div className="product-list-table-wrapper">
                  <table className="product-list-data-table">
                    <thead>
                      <tr>
                        <th scope="col">No</th>
                        <th scope="col">Product Name</th>
                        <th scope="col">Category</th>
                        <th scope="col">Sub-Category</th>
                        <th scope="col">Price (AED)</th>
                        {/* Quantity column removed */}
                        <th scope="col">Unit</th>
                        <th scope="col">Edit</th>
                        <th scope="col">Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleProducts.map((product, index) => (
                        <tr key={product._id}>
                          <td>{activePagination.showingFrom + index}</td>
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

                          {/* Quantity cell removed */}

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
              </TableScrollSync>
            )}

            <Pagination
              page={activePagination.page}
              totalPages={activePagination.totalPages}
              totalRecords={activePagination.totalRecords}
              showingFrom={activePagination.showingFrom}
              showingTo={activePagination.showingTo}
              canPrev={activePagination.canPrev}
              canNext={activePagination.canNext}
              onPrev={activePagination.goPrev}
              onNext={activePagination.goNext}
            />
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