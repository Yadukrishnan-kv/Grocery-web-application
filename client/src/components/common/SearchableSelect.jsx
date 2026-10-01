import "./ProductSearchDropdown.css";
import React, { useState, useMemo, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

/**
 * SearchableSelect
 * A generic searchable dropdown — same design/behavior as ProductSearchDropdown,
 * generalized to replace any plain <select> in the app.
 * Props:
 * - options: Array of { value, label } (label defaults to String(value) if omitted)
 * - value: currently selected value
 * - onChange: function(value)
 * - placeholder: string
 * - disabled: boolean
 * - id: string (forwarded to the input for label htmlFor association)
 * - className: extra class name(s) for the root wrapper
 */
const SearchableSelect = ({
  options = [],
  value,
  onChange,
  placeholder = "Select...",
  disabled = false,
  id,
  className = "",
}) => {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = React.useRef();
  const wrapperRef = useRef(null);
  const [menuRect, setMenuRect] = useState(null);

  // Rendered via a portal below, positioned with fixed coordinates, so the
  // menu isn't clipped when this control sits inside a scrollable table.
  useLayoutEffect(() => {
    if (!open) return;
    const updateMenuRect = () => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      setMenuRect({ top: rect.bottom, left: rect.left, width: rect.width });
    };
    updateMenuRect();
    window.addEventListener("scroll", updateMenuRect, true);
    window.addEventListener("resize", updateMenuRect);
    return () => {
      window.removeEventListener("scroll", updateMenuRect, true);
      window.removeEventListener("resize", updateMenuRect);
    };
  }, [open]);

  const normalizedOptions = useMemo(
    () => options.map((o) => ({ value: o.value, label: o.label ?? String(o.value) })),
    [options]
  );

  const filteredOptions = useMemo(() => {
    if (!search) return normalizedOptions;
    return normalizedOptions.filter((o) =>
      o.label.toLowerCase().includes(search.toLowerCase())
    );
  }, [normalizedOptions, search]);

  const selectedOption = normalizedOptions.find((o) => o.value === value);

  let inputValue = search;
  if (!open && selectedOption && search === "") {
    inputValue = selectedOption.label;
  }

  const handleInputFocus = () => {
    setOpen(true);
    if (selectedOption) setSearch("");
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    setOpen(true);
    if (selectedOption && val === "") {
      onChange("");
    }
  };

  const handleArrowClick = (e) => {
    e.preventDefault();
    if (disabled) return;
    if (!open) {
      setOpen(true);
      setSearch("");
      setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
    } else {
      setOpen(false);
    }
  };

  const handleSelect = (option) => {
    onChange(option.value);
    setSearch("");
    setOpen(false);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
  };

  const handleBlur = () => {
    setTimeout(() => setOpen(false), 120);
  };

  return (
    <div
      ref={wrapperRef}
      className={`product-search-dropdown searchable-select ${className}`.trim()}
      tabIndex={0}
      onBlur={handleBlur}
    >
      <div className="dropdown-control searchbar-style">
        <input
          ref={inputRef}
          id={id}
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
          disabled={disabled}
        >
          <span className="dropdown-arrow">▼</span>
        </button>
      </div>
      {open && menuRect && createPortal(
        <div
          className="dropdown-menu dropdown-menu-portal"
          style={{
            position: "fixed",
            top: menuRect.top,
            left: menuRect.left,
            width: menuRect.width,
          }}
        >
          {filteredOptions.length === 0 ? (
            <div className="dropdown-item no-match">No options found</div>
          ) : (
            filteredOptions.map((o) => (
              <div
                key={o.value}
                className={`dropdown-item${o.value === value ? " selected" : ""}`}
                onMouseDown={() => handleSelect(o)}
              >
                {o.label}
              </div>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export default SearchableSelect;
