import sys
import logging

# Logging configuration
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def predict_task_duration(input_data):
    """Predict task duration based on heuristic rules."""
    try:
        title, description, status, priority, assignedTo, project, startDate = input_data
        logging.info(f"Processing input: {input_data}")

        # Heuristique simple basée sur la priorité et le statut
        priority_weights = {
            "Low": 3,    # 3 jours pour priorité basse
            "Medium": 5, # 5 jours pour priorité moyenne
            "High": 7,   # 7 jours pour priorité haute
            "Urgent": 10 # 10 jours pour priorité urgente
        }

        status_modifiers = {
            "To Do": 1.0,      # Pas de modification
            "In Progress": 0.8, # Réduction de 20% (déjà en cours)
            "Review": 0.5,     # Réduction de 50% (proche de la fin)
            "Done": 0.1,       # Quasi terminé
            "Tested": 0.1      # Quasi terminé
        }

        # Durée de base selon la priorité
        base_duration = priority_weights.get(priority, 5)  # 5 par défaut si priorité inconnue

        # Ajustement selon le statut
        status_modifier = status_modifiers.get(status, 1.0)  # 1.0 par défaut si statut inconnu
        estimated_duration = base_duration * status_modifier

        # Ajustement selon assignedTo (optionnel)
        if assignedTo and assignedTo != "":
            # Si plusieurs personnes sont assignées, réduire légèrement la durée (collaboration)
            num_assignees = len(assignedTo.split(","))
            estimated_duration = estimated_duration / (1 + 0.1 * (num_assignees - 1))  # Réduction de 10% par personne supplémentaire

        logging.info(f"Predicted duration: {estimated_duration}")
        return int(round(estimated_duration))

    except Exception as e:
        logging.error(f"Prediction error: {e}")
        return 5  # Fallback en cas d’erreur inattendue (modifiable si besoin)

if __name__ == "__main__":
    if len(sys.argv) != 8:  # 7 arguments + nom du script
        logging.error("Error: 7 arguments required (title, description, status, priority, assignedTo, project, startDate).")
        sys.exit(1)

    input_data = sys.argv[1:]
    estimated_duration = predict_task_duration(input_data)
    print(estimated_duration)