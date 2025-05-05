const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Modèle utilisateur

const checkRole = (roles) => {
    return async (req, res, next) => {
        try {
            console.log("🔍 Vérification du rôle...");

            // Vérifier si le token est présent
            const token = req.headers.authorization?.split(" ")[1]; 
            if (!token) {
                return res.status(401).json({ message: 'Token manquant' });
            }

            // Décoder le token JWT
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            console.log("✅ Token décodé :", decoded);

            // Rechercher l'utilisateur dans la base de données
            const user = await User.findById(decoded.id);
            if (!user) {
                return res.status(401).json({ message: 'Utilisateur non trouvé' });
            }

            console.log("👤 Rôle de l'utilisateur :", user.role);

            // Vérifier si l'utilisateur a le bon rôle
            if (!roles.includes(user.role)) {
                console.log("⛔ Accès refusé pour :", user.role);
                return res.status(403).json({ message: 'Accès interdit' });
            }

            console.log("✅ Accès autorisé !");
            next();
        } catch (err) {
            console.error("🚨 Erreur dans checkRole :", err);
            return res.status(500).json({ message: 'Erreur d\'authentification', error: err.message });
        }
    };
};

module.exports = { checkRole };

