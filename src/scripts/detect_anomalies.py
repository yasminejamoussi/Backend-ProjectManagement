import pandas as pd
from pymongo import MongoClient
from sklearn.ensemble import IsolationForest
from datetime import datetime, timedelta
import sys

# Connexion à MongoDB
client = MongoClient("mongodb://projectmanagement:project123@mongo:27017/projectmanagement?authSource=admin") 
db = client["projectmanagement"]
collection = db["loginattempts"]
users_collection = db["users"]

# Fonction pour détecter les anomalies
def detect_anomalies(user_email):
    # Récupération des données pour l'utilisateur spécifique
    data = list(collection.find({"email": user_email}, {"_id": 0, "email": 1, "ip": 1, "timestamp": 1, "success": 1}))
    
    if not data:
        return "no_anomaly"

    df = pd.DataFrame(data)

    # Convertir timestamp en secondes
    df["timestamp"] = df["timestamp"].apply(lambda x: x.timestamp())

    # Vérifier si la colonne 'success' existe
    if "success" not in df.columns:
        df["success"] = 0

    # Détection des anomalies avec Isolation Forest
    model = IsolationForest(contamination=0.1, random_state=42)
    df["anomaly"] = model.fit_predict(df[["timestamp", "success"]])

    # Mettre à jour les anomalies dans MongoDB
    anomaly_count = 0
    for index, row in df[df["anomaly"] == -1].iterrows():
        collection.update_one({"email": row["email"], "timestamp": datetime.fromtimestamp(row["timestamp"])}, {"$set": {"anomaly": True}})
        anomaly_count += 1

    print(f"Anomalies détectées pour {user_email}: {anomaly_count}")

    # Mettre à jour le nombre d'anomalies dans 'users'
    users_collection.update_one({"email": user_email}, {"$inc": {"anomaly_count": anomaly_count}})

    # Vérifier le seuil d'anomalies
    user = users_collection.find_one({"email": user_email})
    if user and user.get("anomaly_count", 0) >= 3:
        print(f"Utilisateur {user_email} bloqué pour trop d'anomalies.")
        users_collection.update_one(
            {"email": user_email},
            {"$set": {"blocked": True, "blocked_until": datetime.now() + timedelta(minutes=1)}}
        )
        return "blocked"
    
    #return "anomaly_detected" if anomaly_count > 0 else "no_anomaly"

# Fonction pour traiter une tentative de connexion
def attempt_login(user_email, ip, success):
    # Vérifier si l'utilisateur est bloqué avant d'autoriser la connexion
    user = users_collection.find_one({"email": user_email})
    if user and user.get("blocked", False):
        blocked_until = user.get("blocked_until")
        if blocked_until and datetime.now() < blocked_until:
            print(f"Utilisateur {user_email} est bloqué jusqu'à {blocked_until}.")
            return "blocked"
        else:
            # Débloquer l'utilisateur si le temps est écoulé
            users_collection.update_one(
                {"email": user_email},
                {"$set": {"blocked": False, "blocked_until": None, "anomaly_count": 0}}
            )
            # Réinitialiser les tentatives échouées
            collection.delete_many({"email": user_email, "success": False})
            print(f"Utilisateur {user_email} débloqué.")

    # Si l'utilisateur n'est pas bloqué, enregistrer la tentative
    login_attempt = {
        "email": user_email,
        "ip": ip,
        "timestamp": datetime.now(),
        "success": success
    }
    collection.insert_one(login_attempt)

    # Détecter les anomalies si la tentative échoue
    if not success:
        return detect_anomalies(user_email)
    
    return "no_anomaly"

# Exécution du script en ligne de commande
if __name__ == "__main__":
    user_email = sys.argv[1]
    ip = sys.argv[2]
    success = sys.argv[3] == "True"

    # Appeler la fonction et récupérer le résultat
    result = attempt_login(user_email, ip, success)
    
    # *⚠ Blocage détecté => Ne pas générer le token*
    if result == "blocked":
        print("blocked")
        sys.exit(1)  # Arrêter le script avec un code d'erreur

    print(result)  # Retourner le statut (pour Node.js)