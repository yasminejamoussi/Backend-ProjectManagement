import sys
import json
import re

# Liste complète et corrigée des compétences
SKILL_KEYWORDS = [
    "react", "angular", "spring", "python", "javascript", "node.js", "html", "css",
    "sql", "mongodb", "devops", "machine learning", "java", "javafx", "mysql", "php",
    "symfony", "flutterflow", "c++", ".net", "microservices",
    "figma", "c"
]

def clean_text(text):
    """Nettoie le texte en normalisant les espaces, les caractères spéciaux et en convertissant en minuscules."""
    text = re.sub(r'[,\s/]+', ' ', text.lower())
    text = re.sub(r'\.js', '.js', text)  # Préserver node.js, vue.js, etc.
    text = re.sub(r'mysql', 'mysql', text)  # Normaliser MySQL
    text = re.sub(r'\.net', '.net', text)  # Normaliser .NET
    return text.strip()

def extract_skills(text):
    if not text:
        return []
    
    cleaned_text = clean_text(text)
    skills = set()

    # Recherche des mots-clés avec des limites de mots pour éviter les faux positifs
    for keyword in SKILL_KEYWORDS:
        # Utiliser une expression régulière pour s'assurer que le mot-clé est un mot distinct
        pattern = r'\b' + re.escape(keyword) + r'\b'
        if re.search(pattern, cleaned_text):
            skills.add(keyword)

    return sorted(list(skills))  # Retourner une liste triée pour la cohérence

if __name__ == "__main__":
    try:
        # Lire le texte depuis stdin (au lieu des arguments de la ligne de commande)
        text = sys.stdin.read()
        skills = extract_skills(text)
        print(json.dumps({"skills": skills}))  # Uniquement la sortie JSON
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)