// controllers/productController.js (no change needed)
const Product = require("../models/Product");
const { getPaginationParams, buildPaginatedResponse } = require("../utils/paginate");
const PDFDocument = require("pdfkit");

const createProduct = async (req, res) => {
  try {
    const { productName, CategoryName, subCategoryName, price, cashPrice, quantity, unit } = req.body;

    const product = await Product.create({
      productName,
      CategoryName,
      subCategoryName,
      price,
      cashPrice,
      quantity,
      unit
    });

    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAllProducts = async (req, res) => {
  try {
    const sort = { CategoryName: 1, subCategoryName: 1, productName: 1 };

    if (!req.query.page) {
      const products = await Product.find().sort(sort);
      return res.json(products);
    }

    const { page, limit, skip } = getPaginationParams(req.query);
    const [products, totalRecords] = await Promise.all([
      Product.find().sort(sort).skip(skip).limit(limit),
      Product.countDocuments(),
    ]);
    res.json(buildPaginatedResponse(products, totalRecords, page, limit));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const updateProduct = async (req, res) => {
  try {
    const updateData = {};
    const allowedFields = ["productName", "CategoryName", "subCategoryName", "price", "cashPrice", "quantity", "unit"];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const toggleProductStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be a boolean" });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Product Catalog PDF — grouped by Category, each category rendered as a
// navy banner followed by a table of its products (Sub-Category/Unit/Price).
// Continues across pages: a slim repeated header plus a "(contd.)" banner
// for whichever category was interrupted by the page break.
// ─────────────────────────────────────────────────────────────────────────
const downloadProductCatalog = async (req, res) => {
  try {
    const products = await Product.find().sort({
      CategoryName: 1,
      subCategoryName: 1,
      productName: 1,
    });

    const grouped = new Map();
    products.forEach((p) => {
      const cat = p.CategoryName || "Uncategorized";
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat).push(p);
    });

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;
    const bottomLimit = pageHeight - margin - 25; // leaves room for the page-number footer

    const navy = "#002D62";
    const navyLight = "#E8EEF6";
    const textDark = "#1F2937";
    const gray = "#6B7280";
    const rowAlt = "#F8FAFC";
    const border = "#E2E8F0";

    const colDefs = [
      { key: "no", header: "#", width: 28, align: "center" },
      { key: "name", header: "Product Name", width: 260, align: "left" },
      { key: "sub", header: "Sub-Category", width: 160, align: "left" },
    ];
    const remainingWidth = contentWidth - colDefs.reduce((s, c) => s + c.width, 0);
    colDefs.push({ key: "price", header: "Price (AED)", width: remainingWidth, align: "right" });
    let colX = margin;
    const cols = colDefs.map((c) => {
      const result = { ...c, x: colX };
      colX += c.width;
      return result;
    });

    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="product-catalog-${new Date().toISOString().slice(0, 10)}.pdf"`
    );
    doc.pipe(res);

    let y = margin;

    const drawTopHeader = (isFirstPage) => {
      y = margin;

      doc.rect(margin, y, contentWidth, 26).fill(navy);
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(12)
        .text("PRODUCT CATALOG", margin, y + 7, { width: contentWidth, align: "center" });
      y += 26 + 10;

      if (isFirstPage) {
        doc.fillColor(gray).font("Helvetica").fontSize(8.5)
          .text(
            `Total Products: ${products.length}   |   Categories: ${grouped.size}`,
            margin,
            y,
            { width: contentWidth, align: "right" }
          );
        y += 18;
      }
    };

    const drawTableHeaderRow = () => {
      doc.font("Helvetica-Bold").fontSize(8.5);
      let rowHeight = 20;
      cols.forEach((c) => {
        const h = doc.heightOfString(c.header, { width: c.width - 12 }) + 12;
        if (h > rowHeight) rowHeight = h;
      });

      doc.rect(margin, y, contentWidth, rowHeight).fill(navyLight);
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(navy);
      cols.forEach((c) =>
        doc.text(c.header, c.x + 6, y + 6, { width: c.width - 12, align: c.align })
      );
      y += rowHeight;
    };

    // Callers are responsible for calling ensureSpace() before this — either
    // right after a fresh page (plenty of room) or with enough lookahead to
    // fit the band itself, so this never needs to check space on its own.
    const drawCategoryBand = (label) => {
      doc.rect(margin, y, contentWidth, 22).fill(navy);
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(10)
        .text(label, margin + 8, y + 6, { width: contentWidth - 16 });
      y += 22 + 4;
      drawTableHeaderRow();
    };

    const ensureSpace = (needed, continuingCategory) => {
      if (y + needed > bottomLimit) {
        doc.addPage({ size: "A4", margin: 0 });
        drawTopHeader(false);
        if (continuingCategory) {
          drawCategoryBand(`${continuingCategory} (contd.)`);
        }
      }
    };

    drawTopHeader(true);

    if (products.length === 0) {
      doc.fillColor(gray).font("Helvetica-Oblique").fontSize(11)
        .text("No products found.", margin, y + 20, { width: contentWidth, align: "center" });
    }

    for (const [categoryName, items] of grouped.entries()) {
      ensureSpace(22 + 4 + 34 + 24, null); // band + (possibly 2-line) header row + lookahead for 1st data row
      drawCategoryBand(`${categoryName}   (${items.length} item${items.length !== 1 ? "s" : ""})`);

      items.forEach((p, idx) => {
        const rowVals = {
          no: String(idx + 1),
          name: p.productName || "-",
          sub: p.subCategoryName || "-",
          price: (p.price || 0).toFixed(2),
        };

        doc.font("Helvetica").fontSize(8.5);
        let rowHeight = 20;
        cols.forEach((c) => {
          const h = doc.heightOfString(String(rowVals[c.key]), { width: c.width - 12 }) + 10;
          if (h > rowHeight) rowHeight = h;
        });

        ensureSpace(rowHeight, categoryName);

        if (idx % 2 === 1) {
          doc.rect(margin, y, contentWidth, rowHeight).fill(rowAlt);
        }
        doc.font("Helvetica").fontSize(8.5).fillColor(textDark);
        cols.forEach((c) => {
          doc.text(String(rowVals[c.key]), c.x + 6, y + 5, { width: c.width - 12, align: c.align });
        });
        doc.moveTo(margin, y + rowHeight).lineTo(margin + contentWidth, y + rowHeight)
          .lineWidth(0.5).strokeColor(border).stroke();

        y += rowHeight;
      });

      y += 14;
    }

    // Page numbers on every page, drawn last so they sit over nothing else.
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const { width, height } = doc.page;
      doc.fontSize(8).font("Helvetica").fillColor(gray)
        .text(`Page ${i + 1} of ${range.count}`, 0, height - 20, { width, align: "center", lineBreak: false });
    }

    doc.end();
  } catch (error) {
    console.error("Error generating product catalog PDF:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
};

module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  toggleProductStatus,
  downloadProductCatalog,
};