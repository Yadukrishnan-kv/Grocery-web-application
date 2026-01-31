const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve React build files (static assets like js, css, images)
app.use(express.static(path.join(__dirname, 'build')));

// Your API routes (these MUST come BEFORE the catch-all)
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/roles', require('./routes/roleRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/subcategories', require('./routes/subCategoryRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/bills', require('./routes/billRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));

// Health check endpoint
app.get('/api/ping', (req, res) => {
  res.status(200).json({ message: 'Server is running fine 🚀' });
});

// Catch-all route: Serve React app for all non-API routes (MUST BE LAST!)
app.get(/^(?!\/api).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'), (err) => {
    if (err) {
      console.error('Error sending index.html:', err);
      res.status(500).send('Server error');
    }
  });
});

const PORT = process.env.PORT 

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});