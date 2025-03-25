const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();

// Importer les routes
const authRoutes = require("./routes/authRoutes");
const roleRoutes = require("./routes/roleRoutes");
const projectRoutes = require("./routes/projectRoutes");
const profileRoutes = require("./routes/profileRoutes");
const taskRoutes = require("./routes/taskRoutes");

const app = express();

// 🔹 Middleware
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(cors({
    origin: 'http://localhost:5173', // Ou l'URL de votre frontend si c'est dans un autre conteneur
}));

// 🔹 Routes
app.use("/api/auth", authRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api", taskRoutes);

app.get("/", (req, res) => {
    res.send("Backend is running...");
});

// 🔹 Gestion des erreurs
app.use((err, req, res, next) => {
    console.error("❌ Erreur serveur:", err.stack);
    res.status(500).json({ error: "Internal Server Error", message: err.message });
});

// Fonction pour démarrer le serveur
const startServer = () => {
    const PORT = process.env.PORT || 4000;
    const server = app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });

    // Gérer la fermeture gracieuse
    process.on("SIGTERM", () => {
        console.log("📢 SIGTERM reçu. Fermeture gracieuse du serveur...");
        server.close(() => {
            console.log("🛑 Serveur fermé.");
            mongoose.connection.close(false, () => {
                console.log("🛑 Connexion MongoDB fermée.");
                process.exit(0);
            });
        });
    });

    return server;
};

// 🔹 Connecter MongoDB et démarrer le serveur seulement si ce n'est PAS un test
if (process.env.NODE_ENV !== "test") {
    const connectToMongoDB = async () => {
        try {
            console.log("🕐 Connexion à MongoDB...");
            await mongoose.connect(process.env.MONGO_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
            });

            let attempts = 0;
            const maxAttempts = 10;
            while (mongoose.connection.readyState !== 1 && attempts < maxAttempts) {
                console.log(`🔄 Tentative ${attempts + 1} de connexion à MongoDB...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
                attempts++;
            }

            if (mongoose.connection.readyState !== 1) {
                throw new Error("❌ Impossible de se connecter à MongoDB.");
            }

            console.log("✅ Connected to MongoDB");
            startServer();
        } catch (err) {
            console.error("❌ MongoDB connection error:", err);
            process.exit(1);
        }
    };

    connectToMongoDB();
}

module.exports = { app, startServer };