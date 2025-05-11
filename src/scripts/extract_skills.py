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

    # Recherche directe des mots-clés
    for keyword in SKILL_KEYWORDS:
        if keyword in cleaned_text:
            skills.add(keyword)

    return sorted(list(skills))  # Retourner une liste triée pour la cohérence

if __name__ == "__main__":
    try:
        # Lire le texte depuis les arguments de la ligne de commande
        if len(sys.argv) < 2:
            print(json.dumps({"error": "Texte manquant"}), file=sys.stderr)
            sys.exit(1)
        text = sys.argv[1]
        skills = extract_skills(text)
        print(json.dumps({"skills": skills}))  # Uniquement la sortie JSON
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)