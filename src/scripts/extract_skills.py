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
    """Nettoie le texte en normalisant les espaces et les séparateurs, et en convertissant en minuscules."""
    text = re.sub(r'[,\s/]+', ' ', text.lower())  # Remplace virgules, espaces et barres obliques par un espace
    text = re.sub(r'\.js', '.js', text)  # Préserver node.js, vue.js, etc.
    text = re.sub(r'mysql', 'mysql', text)  # Normaliser MySQL
    text = re.sub(r'\.net', '.net', text)  # Normaliser .NET
    return text.strip()

def extract_skills(text):
    if not text:
        print("DEBUG: Texte vide", file=sys.stderr)
        return []
    
    cleaned_text = clean_text(text)
    print(f"DEBUG: Texte nettoyé (premier 200 chars) : {cleaned_text[:200]}", file=sys.stderr)

    skills = set()
    # Recherche directe des mots-clés dans le texte nettoyé
    for keyword in SKILL_KEYWORDS:
        # Créer une regex pour le mot-clé, en s'assurant qu'il est entouré de limites de mots
        pattern = r'\b' + re.escape(keyword) + r'\b'
        if re.search(pattern, cleaned_text):
            print(f"DEBUG: Compétence trouvée : {keyword}", file=sys.stderr)
            skills.add(keyword)

    print(f"DEBUG: Compétences finales : {sorted(list(skills))}", file=sys.stderr)
    return sorted(list(skills))

if __name__ == "__main__":
    try:
        if len(sys.argv) < 2:
            print(json.dumps({"error": "Texte manquant"}), file=sys.stderr)
            sys.exit(1)
        text = sys.argv[1]
        skills = extract_skills(text)
        print(json.dumps({"skills": skills}))  # Uniquement la sortie JSON
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)