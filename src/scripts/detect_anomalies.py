import pandas as pd
from pymongo import MongoClient
from sklearn.ensemble import IsolationForest
from datetime import datetime, timedelta
import sys
import json
import traceback

try:
  # Rediriger les logs vers stderr
  def log(message):
    print(message, file=sys.stderr)

  log("Connexion à MongoDB...")
  client = MongoClient("mongodb://projectmanagement:project123@mongo:27017/projectmanagement?authSource=admin")
  db = client["projectmanagement"]
  collection = db["loginattempts"]
  users_collection = db["users"]
  log("Connexion réussie.")

  def detect_anomalies(user_email):
    log(f"Début de la détection d'anomalies pour {user_email}")
    data = list(collection.find({"email": user_email}, {"_id": 0, "email": 1, "ip": 1, "timestamp": 1, "success": 1}))
    log(f"Données récupérées : {len(data)} entrées")

    if not data:
      log("Aucune donnée pour cet utilisateur, pas d'anomalie.")
      return "no_anomaly"

    df = pd.DataFrame(data)
    log(f"DataFrame créé : {df.shape}")

    df["timestamp"] = df["timestamp"].apply(lambda x: x.timestamp())
    log(f"Timestamps convertis")

    if "success" not in df.columns:
      log("Colonne 'success' absente, initialisation à 0")
      df["success"] = 0

    model = IsolationForest(contamination=0.1, random_state=42)
    df["anomaly"] = model.fit_predict(df[["timestamp", "success"]])
    log(f"Anomalies détectées : {len(df[df['anomaly'] == -1])}")

    anomaly_count = 0
    for index, row in df[df["anomaly"] == -1].iterrows():
      collection.update_one(
        {"email": row["email"], "timestamp": datetime.fromtimestamp(row["timestamp"])},
        {"$set": {"anomaly": True}}
      )
      anomaly_count += 1

    log(f"Nombre total d'anomalies : {anomaly_count}")

    users_collection.update_one({"email": user_email}, {"$inc": {"anomaly_count": anomaly_count}})

    user = users_collection.find_one({"email": user_email})
    log(f"Utilisateur trouvé : {user.get('email')}")
    if user and user.get("anomaly_count", 0) >= 3:
      log(f"Utilisateur {user_email} bloqué pour trop d'anomalies.")
      users_collection.update_one(
        {"email": user_email},
        {"$set": {"blocked": True, "blocked_until": datetime.now() + timedelta(minutes=1)}}
      )
      return "blocked"

    return "no_anomaly"

  def attempt_login(user_email, ip, success):
    log(f"Tentative de connexion pour {user_email}, IP: {ip}, Success: {success}")
    user = users_collection.find_one({"email": user_email})
    if user and user.get("blocked", False):
      blocked_until = user.get("blocked_until")
      if blocked_until and datetime.now() < blocked_until:
        log(f"Utilisateur {user_email} est bloqué jusqu'à {blocked_until}.")
        return "blocked"
      else:
        users_collection.update_one(
          {"email": user_email},
          {"$set": {"blocked": False, "blocked_until": None, "anomaly_count": 0}}
        )
        collection.delete_many({"email": user_email, "success": False})
        log(f"Utilisateur {user_email} débloqué.")

    login_attempt = {
      "email": user_email,
      "ip": ip,
      "timestamp": datetime.now(),
      "success": success
    }
    collection.insert_one(login_attempt)
    log(f"Tentative enregistrée : {login_attempt}")

    if not success:
      return detect_anomalies(user_email)

    return "no_anomaly"

  if __name__ == "__main__":
    log("Démarrage du script Python...")
    user_email = sys.argv[1]
    ip = sys.argv[2]
    success = sys.argv[3] == "True"

    result = attempt_login(user_email, ip, success)
    print(json.dumps({"status": result}))  # Seule sortie sur stdout
    sys.exit(0)

except Exception as e:
  print(json.dumps({"error": str(e)}))  # Sortie JSON pour les erreurs
  log(f"Erreur dans le script Python: {str(e)}")
  traceback.print_exc(file=sys.stderr)
  sys.exit(1)