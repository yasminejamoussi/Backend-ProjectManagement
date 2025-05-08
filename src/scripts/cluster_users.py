import sys
import json
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

# Liste des compétences possibles (doit correspondre à SKILL_KEYWORDS dans extract_skills.py)
SKILL_KEYWORDS = [
    "react", "javascript", "python", "sql", "java", "project management",
    "node.js", "node", "html", "css", "typescript", "mongodb", "docker", "aws",
    "angular", "vue.js", "git", "jenkins", "kubernetes","Spring","Angular"
    "ingénierie informatique", "développement logiciel", "gestion de projet","Node.Js"
    "ui design", "ux design", "api development", "backend development", "frontend development",
    "database design", "cloud computing", "machine learning", "data analysis", "devops","HTML","CSS"
]

def normalize_skills(users_skills):
    """
    Normalise les compétences en ne gardant que celles qui sont dans SKILL_KEYWORDS.
    """
    normalized_skills = []
    for user_skills in users_skills:
        # Convertir en minuscules et filtrer uniquement les compétences valides
        valid_skills = [skill.lower() for skill in user_skills if skill.lower() in [kw.lower() for kw in SKILL_KEYWORDS]]
        # Si un utilisateur n'a aucune compétence valide, lui attribuer une compétence par défaut
        if not valid_skills:
            valid_skills = ["unknown"]
        normalized_skills.append(valid_skills)
    return normalized_skills

def vectorize_skills(users_skills):
    """
    Convertit les listes de compétences en une matrice TF-IDF.
    users_skills: Liste de listes de compétences (ex. [["react", "typescript"], ["sql", "mongodb"]])
    Retourne une matrice où chaque ligne est un utilisateur et chaque colonne une compétence.
    """
    # Créer une liste de chaînes pour le vectoriseur (joindre les compétences de chaque utilisateur)
    skill_strings = [" ".join(skills) for skills in users_skills]

    # Utiliser TfidfVectorizer pour convertir en matrice TF-IDF
    vocabulary = SKILL_KEYWORDS + ["unknown"]
    vectorizer = TfidfVectorizer(
        vocabulary=vocabulary,
        lowercase=False,
        token_pattern=r"(?u)\b\w[\w\.]+\b",
        norm='l2',  # Normalisation pour réduire l'impact des compétences rares
        sublinear_tf=True  # Réduire l'impact des compétences fréquentes
    )
    skill_matrix = vectorizer.fit_transform(skill_strings).toarray()

    return skill_matrix

def estimate_num_clusters(skill_matrix, max_clusters=None):
    """
    Estime le nombre optimal de clusters en utilisant le score de silhouette.
    """
    if skill_matrix.shape[0] < 2:
        return 1  # Pas assez de données pour clusteriser

    # Définir max_clusters comme la moitié du nombre d'utilisateurs, ou moins si spécifié
    if max_clusters is None:
        max_clusters = max(2, skill_matrix.shape[0] // 2)
    max_clusters = min(max_clusters, skill_matrix.shape[0])

    # Tester différents nombres de clusters (de 2 à max_clusters)
    silhouette_scores = []
    for k in range(2, max_clusters + 1):
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=20)
        labels = kmeans.fit_predict(skill_matrix)
        score = silhouette_score(skill_matrix, labels)
        silhouette_scores.append((k, score))

    # Choisir le k avec le meilleur score de silhouette
    if silhouette_scores:
        best_k = max(silhouette_scores, key=lambda x: x[1])[0]
        return best_k
    return 2  # Par défaut

def cluster_users(users_skills, num_clusters=None):
    """
    Effectue le clustering des utilisateurs basé sur leurs compétences.
    users_skills: Liste de listes de compétences
    num_clusters: Nombre de clusters à créer (si None, estimé automatiquement)
    Retourne une liste d'étiquettes de clusters pour chaque utilisateur.
    """
    if not users_skills or len(users_skills) < 2:
        return [0] * len(users_skills)  # Si trop peu d'utilisateurs, mettre tout le monde dans le même cluster

    # Normaliser les compétences
    normalized_skills = normalize_skills(users_skills)

    # Vectoriser les compétences
    skill_matrix = vectorize_skills(normalized_skills)

    # Estimer le nombre de clusters si non spécifié
    if num_clusters is None or num_clusters < 1:
        num_clusters = estimate_num_clusters(skill_matrix)
    elif len(users_skills) < num_clusters:
        num_clusters = len(users_skills)  # Ajuster si trop peu d'utilisateurs

    # Appliquer k-means
    kmeans = KMeans(n_clusters=num_clusters, random_state=42, n_init=20)
    cluster_labels = kmeans.fit_predict(skill_matrix)

    return cluster_labels.tolist()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Données manquantes"}), file=sys.stderr)
        sys.exit(1)

    try:
        # Charger les données (liste de listes de compétences)
        users_skills = json.loads(sys.argv[1])
        num_clusters = int(sys.argv[2]) if len(sys.argv) > 2 else None  # Si pas spécifié, estimé automatiquement

        # Effectuer le clustering
        labels = cluster_users(users_skills, num_clusters)

        # Retourner les étiquettes des clusters
        print(json.dumps({"clusters": labels}))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)