const CustomerProductPrice = require("../models/CustomerProductPrice");

// Get custom prices for a customer (all products or specific product)
const getCustomerPrices = async (req, res) => {
  try {
    const { customerId, productId } = req.query;
    if (!customerId) {
      return res.status(400).json({ message: "customerId is required" });
    }

    const filter = { customer: customerId };
    if (productId) filter.product = productId;

    const prices = await CustomerProductPrice.find(filter)
      .populate("product", "productName price unit");

    if (productId) {
      return res.json(prices.length > 0 ? prices[0] : null);
    }
    res.json(prices);
  } catch (error) {
    console.error("Get customer prices error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Create or update a custom price
const upsertCustomerPrice = async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      return res.status(403).json({ message: "Only Admin can set custom prices" });
    }

    const { customerId, productId, price } = req.body;
    if (!customerId || !productId || price === undefined) {
      return res.status(400).json({ message: "customerId, productId, and price are required" });
    }

    if (price < 0) {
      return res.status(400).json({ message: "Price cannot be negative" });
    }

    const existing = await CustomerProductPrice.findOne({
      customer: customerId,
      product: productId,
    });

    if (existing) {
      existing.price = price;
      await existing.save();
      return res.json({ message: "Custom price updated", price: existing });
    }

    const newPrice = await CustomerProductPrice.create({
      customer: customerId,
      product: productId,
      price,
    });
    res.status(201).json({ message: "Custom price created", price: newPrice });
  } catch (error) {
    console.error("Upsert customer price error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Delete a custom price
const deleteCustomerPrice = async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      return res.status(403).json({ message: "Only Admin can delete custom prices" });
    }

    const deleted = await CustomerProductPrice.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Custom price not found" });
    }
    res.json({ message: "Custom price deleted" });
  } catch (error) {
    console.error("Delete customer price error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { getCustomerPrices, upsertCustomerPrice, deleteCustomerPrice };
