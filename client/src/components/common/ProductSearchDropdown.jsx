
import "./ProductSearchDropdown.css";
import React, { useState, useMemo } from "react";

/**
 * ProductSearchDropdown
 * A searchable dropdown for selecting products.
 * Props:
 * - products: Array of product objects (must have _id, productName, unit)
 * - value: selected productId
 * - onChange: function(productId)
 * - placeholder: string
 * - disabled: boolean
 */

const ProductSearchDropdown = ({ products, value, onChange, placeholder = "Select Product", disabled = false }) => {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = React.useRef();

  // Filter products by search
  const filteredProducts = useMemo(() => {
    // If dropdown is open and search is empty, show all products
    if (open && search === "") return products;
    if (!search) return products;
    return products.filter(
      (p) =>
        p.productName.toLowerCase().includes(search.toLowerCase()) ||
        (p.unit && p.unit.toLowerCase().includes(search.toLowerCase()))
    );
  }, [products, search, open]);

  const selectedProduct = products.find((p) => p._id === value);

  // Show selected product in input, but allow search
  let inputValue = search;
  if (!open && selectedProduct && search === "") {
    inputValue = `${selectedProduct.productName} - ${selectedProduct.unit}`;
  }

  // Open dropdown on input focus or arrow click
  const handleInputFocus = () => {
    setOpen(true);
    // If a product is selected, clear search so user can type new search
    if (selectedProduct) setSearch("");
  };

  // When user types, open dropdown and filter
  const handleInputChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    setOpen(true);
    // If user clears input, clear selection
    if (selectedProduct && val === "") {
      onChange("");
    }
  };

  // When user clicks arrow, toggle dropdown
  const handleArrowClick = (e) => {
    e.preventDefault();
    if (!open) {
      setOpen(true);
      setSearch("");
      setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
    } else {
      setOpen(false);
    }
  };

  // When user selects a product
  const handleSelect = (product) => {
    onChange(product._id);
    setSearch("");
    setOpen(false);
    // Focus input for immediate re-search
    setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
  };

  // Close dropdown on blur (with delay for click)
  const handleBlur = () => {
    setTimeout(() => setOpen(false), 120);
  };

  return (
    <div className="product-search-dropdown" tabIndex={0} onBlur={handleBlur}>
      <div className="dropdown-control searchbar-style">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          disabled={disabled}
          className="dropdown-input"
          autoComplete="off"
        />
        <button
          type="button"
          className="dropdown-arrow-btn"
          tabIndex={-1}
          onMouseDown={handleArrowClick}
          aria-label="Show dropdown"
        >
          <span className="dropdown-arrow">▼</span>
        </button>
      </div>
      {open && (
        <div className="dropdown-menu">
          {filteredProducts.length === 0 ? (
            <div className="dropdown-item no-match">No products found</div>
          ) : (
            filteredProducts.map((p) => (
              <div
                key={p._id}
                className={`dropdown-item${p._id === value ? " selected" : ""}`}
                onMouseDown={() => handleSelect(p)}
              >
                {p.productName} - {p.unit}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ProductSearchDropdown;
