from pymongo import MongoClient
from datetime import datetime, timedelta
import sys
import json
import traceback
from bson import ObjectId

try:
    def log(message):
        print(message, file=sys.stderr)

    # Helper function to serialize MongoDB documents
    def serialize_doc(doc):
        if not doc:
            return {}
        result = {}
        for k, v in doc.items():
            if k == 'password':  # Skip password field
                continue
            if isinstance(v, ObjectId):
                result[k] = str(v)
            elif isinstance(v, datetime):
                result[k] = v.isoformat()
            elif isinstance(v, dict):
                result[k] = serialize_doc(v)
            elif isinstance(v, list):
                result[k] = [serialize_doc(item) if isinstance(item, dict) else str(item) if isinstance(item, ObjectId) else item for item in v]
            else:
                result[k] = v
        return result

    log("Connexion à MongoDB...")
    client = MongoClient("mongodb://projectmanagement:project123@mongo:27017/projectmanagement?authSource=admin")
    db = client["projectmanagement"]
    collection = db["loginattempts"]
    users_collection = db["users"]
    log("Connexion réussie.")

    # Créer un index unique sur le champ email
    try:
        users_collection.create_index([("email", 1)], unique=True)
        log("Index unique créé sur le champ 'email'.")
    except Exception as e:
        log(f"Erreur lors de la création de l'index: {str(e)}")

    def handle_failed_login(user_email):
        user_email = user_email.lower().strip()
        log(f"Traitement de l'échec de connexion pour {user_email}")

        # Récupérer l'utilisateur avant mise à jour
        user_before = users_collection.find_one({"email": user_email})
        anomaly_count_before = user_before.get("anomaly_count", 0) if user_before else 0
        user_before_doc = serialize_doc(user_before)
        log(f"Avant incrément: anomaly_count={anomaly_count_before}, user_id={str(user_before.get('_id')) if user_before else None}, user_doc={json.dumps(user_before_doc)}")

        # Incrémenter anomaly_count
        result = users_collection.update_one(
            {"email": user_email},
            {"$inc": {"anomaly_count": 1}},
            upsert=True
        )
        log(f"anomaly_count incrémenté: matched={result.matched_count}, modified={result.modified_count}")

        # Vérifier si le seuil est atteint
        user = users_collection.find_one({"email": user_email})
        anomaly_count = user.get("anomaly_count", 0) if user else 0
        user_doc = serialize_doc(user)
        log(f"Utilisateur trouvé : {user.get('email') if user else None}, anomaly_count={anomaly_count}, user_id={str(user.get('_id')) if user else None}, user_doc={json.dumps(user_doc)}")

        if anomaly_count >= 3:
            log(f"Utilisateur {user_email} bloqué pour trop d'anomalies.")
            blocked_until = datetime.now() + timedelta(minutes=1)
            users_collection.update_one(
                {"email": user_email},
                {"$set": {"blocked": True, "blocked_until": blocked_until}}
            )
            return "blocked"

        return "no_anomaly"

    def attempt_login(user_email, ip, success):
        user_email = user_email.lower().strip()
        log(f"Tentative de connexion pour {user_email}, IP: {ip}, Success: {success}")

        user = users_collection.find_one({"email": user_email})

        # Vérifier si l'utilisateur est bloqué
        if user and user.get("blocked", False):
            blocked_until = user.get("blocked_until")
            log(f"blocked_until: {blocked_until}, type: {type(blocked_until)}, current time: {datetime.now()}")
            if blocked_until and isinstance(blocked_until, datetime) and datetime.now() < blocked_until:
                log(f"Utilisateur {user_email} est bloqué jusqu'à {blocked_until}.")
                return "blocked"
            else:
                log(f"Utilisateur {user_email} débloqué, réinitialisation de l'état.")
                result = users_collection.update_one(
                    {"email": user_email},
                    {
                        "$set": {
                            "blocked": False,
                            "blocked_until": None,
                            "anomaly_count": 0
                        }
                    }
                )
                log(f"Update result: matched={result.matched_count}, modified={result.modified_count}")

        # Enregistrer la tentative de connexion
        login_attempt = {
            "email": user_email,
            "ip": ip,
            "timestamp": datetime.now(),
            "success": success
        }
        collection.insert_one(login_attempt)
        login_attempt_doc = serialize_doc(login_attempt)
        log(f"Tentative enregistrée : {json.dumps(login_attempt_doc)}")

        # Connexion réussie
        if success:
            log(f"Connexion réussie pour {user_email}, réinitialisation du compteur d'anomalies.")
            result = users_collection.update_one(
                {"email": user_email},
                {"$set": {"anomaly_count": 0}}
            )
            log(f"anomaly_count réinitialisé à 0: matched={result.matched_count}, modified={result.modified_count}")
            collection.delete_many({"email": user_email, "success": False})
            return "no_anomaly"

        # Connexion échouée
        else:
            log(f"Échec de connexion, appel de handle_failed_login pour {user_email}")
            return handle_failed_login(user_email)

    # Exécution du script
    if __name__ == "__main__":
        log("Démarrage du script Python...")
        user_email = sys.argv[1]
        ip = sys.argv[2]
        success = sys.argv[3].lower() == "true"
        log(f"Arguments reçus: user_email={user_email}, ip={ip}, success={success}")

        result = attempt_login(user_email, ip, success)
        print(json.dumps({"status": result}))
        sys.exit(0)

except Exception as e:
    print(json.dumps({"error": str(e)}))
    log(f"Erreur dans le script Python: {str(e)}")
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
