const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();

// Importer les routes (que nous allons créer après)
const authRoutes = require("./routes/authRoutes");

const app = express();

// 🔹 Middleware
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(cors({
  origin: 'http://localhost:5173', // Ou l'URL de votre frontend si c'est dans un autre conteneur
}));


// 🔹 Connexion à MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// 🔹 Routes
app.use("/api/auth", authRoutes);


app.get("/", (req, res) => {
  res.send(" Backend is running...");
});

// 🔹 Gestion des erreurs (pour une API REST)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

// 🔹 Définition du port
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

module.exports = app;