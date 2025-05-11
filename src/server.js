const express = require("express");
   const mongoose = require("mongoose");
   const cors = require("cors");
   const morgan = require("morgan");
   require("dotenv").config();
   const cron = require("node-cron");
   const { checkAndNotifyDelays } = require("./controllers/notificationController");
   const { scheduleAnomalyDetection } = require("./utils/anomalyDetection");
   const logActivity = require("./middleware/logActivity");

   // Importer les routes
   const authRoutes = require("./routes/authRoutes");
   const roleRoutes = require("./routes/roleRoutes");
   const projectRoutes = require("./routes/projectRoutes");
   const profileRoutes = require("./routes/profileRoutes");
   const taskRoutes = require("./routes/taskRoutes");
   const notificationRoutes = require("./routes/notificationRoutes");
   const activityLogRoutes = require("./routes/activityLogRoutes");

   const app = express();

   // 🔹 Middleware CORS (en premier)
   app.use(cors({
     origin: (origin, callback) => {
       const allowedOrigins = [
         "http://localhost:5173",
         "https://frontend-projectmanagement-5cfm.onrender.com"
       ];
       console.log('CORS Origin reçue:', origin);
       if (!origin || allowedOrigins.includes(origin)) {
         callback(null, true);
       } else {
         console.error('CORS bloqué pour origin:', origin);
         callback(new Error('Not allowed by CORS'));
       }
     },
     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     allowedHeaders: ['Content-Type', 'Authorization'],
     credentials: true
   }));

   // Gérer explicitement les requêtes OPTIONS
   app.options('*', (req, res) => {
    console.log('Requête OPTIONS reçue pour:', req.url);
    res.status(204).end();
  });

   // 🔹 Middleware de débogage
   app.use((req, res, next) => {
     console.log('Requête reçue:', req.method, req.url);
     console.log('Origine de la requête:', req.headers.origin);
     console.log('En-têtes CORS ajoutés:', res.get('Access-Control-Allow-Origin'));
     next();
   });

   // 🔹 Autres middlewares
   app.use(morgan("dev"));
   app.use(express.json());
   app.use(express.urlencoded({ extended: false }));
   app.use(logActivity);

   // 🔹 Routes
   app.use("/api/auth", authRoutes);
   app.use("/api/roles", roleRoutes);
   app.use("/api/projects", projectRoutes);
   app.use("/api/profile", profileRoutes);
   app.use("/api", taskRoutes);
   app.use("/api/notifications", notificationRoutes);
   app.use("/api/logs", activityLogRoutes);

   app.get("/", (req, res) => {
     res.send("Backend is running...");
   });

   // 🔹 Tâche cron pour vérifier les retards
   // cron.schedule("*/5 * * * *", () => {
   //   console.log("Exécution de la vérification des retards...");
   //   checkAndNotifyDelays();
   // });

   // 🔹 Gestion des erreurs
   app.use((err, req, res, next) => {
     console.error('Erreur serveur:', err.stack);
     res.status(500).json({ error: "Internal Server Error" });
   });

   // 🔹 Connexion à MongoDB et démarrage du serveur
   if (process.env.NODE_ENV !== "test") {
     mongoose
       .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
       .then(async () => {
         console.log("✅ Connected to MongoDB");
         const PORT = process.env.PORT || 4000;
         app.listen(PORT, () => {
           console.log(`🚀 Server running on port ${PORT}`);
           scheduleAnomalyDetection();
         });
       })
       .catch((err) => {
         console.error("❌ MongoDB connection error:", err.message);
         process.exit(1);
       });
   }

   module.exports = app;
