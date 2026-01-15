const express =require('express');
const dotenv=require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const app = express();
app.use(cors());
app.use(express.json());

const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);
const userRoutes = require("./routes/userRoutes");
app.use("/api/users", userRoutes);
const roleRoutes = require("./routes/roleRoutes");
app.use("/api/roles", roleRoutes);
const categoryRoutes = require("./routes/categoryRoutes");
app.use("/api/categories", categoryRoutes);
const subCategoryRoutes = require("./routes/subCategoryRoutes");
app.use("/api/subcategories", subCategoryRoutes);
const productRoutes = require("./routes/productRoutes");
app.use("/api/products", productRoutes);
const customerRoutes = require("./routes/customerRoutes");
app.use("/api/customers", customerRoutes);
const orderRoutes = require("./routes/orderRoutes");
app.use("/api/orders", orderRoutes);
const billRoutes = require("./routes/billRoutes");
app.use("/api/bills", billRoutes);

app.get('/api/ping',(res,req)=>{
    res.send("Server is running up fine");
})

const port = process.env.PORT ;
app.listen(port, (err) => {
  if (err) {
    console.error("Server failed to start:", err);
    process.exit(1);
  }
  console.log(`Server is running on port ${port}`);
});


