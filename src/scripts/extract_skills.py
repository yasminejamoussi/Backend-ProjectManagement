import sys
import json
import re

# Liste complète et corrigée des compétences
SKILL_KEYWORDS = [
    "react", "angular", "spring", "python", "javascript", "node.js", "html", "css",
    "sql", "mongodb", "devops", "machine learning", "java", "javafx", "mysql", "php",
    "symfony", "flutterflow", "c++", ".net", "microservices", "figma", "c", "firebase", "qt"
]

def clean_text(text):
    """Nettoie le texte en normalisant les espaces et les séparateurs, et en convertissant en minuscules."""
    if not text or not isinstance(text, str):
        return ""
    text = re.sub(r'[,\s/|]+', ' ', text.lower().strip())  # Remplace virgules, espaces, barres par un espace
    text = re.sub(r'\.{2,}', ' ', text)  # Remplacer les ellipses (...) par un espace
    text = re.sub(r'\b(\w+\.js)\b', r'\1', text)  # Préserver node.js, vue.js, etc.
    text = re.sub(r'\bmysql\b', 'mysql', text)  # Normaliser MySQL
    text = re.sub(r'\b\.net\b', '.net', text)  # Normaliser .NET
    return text

def extract_skills_from_section(text, section_markers=["langues", "skills", "compétences"]):
    if not text:
        print("DEBUG: Texte vide ou invalide")
        return []
    
    cleaned_text = clean_text(text)
    print(f"DEBUG: Texte nettoyé (premier 200 chars) : {cleaned_text[:200]}")

    # Trouver la section "langues" (qui suit la section des compétences)
    section_end = -1
    for marker in section_markers:
        section_end = cleaned_text.find(marker)
        if section_end != -1:
            print(f"DEBUG: Marqueur '{marker}' trouvé")
            break
    if section_end == -1:
        print(f"DEBUG: Aucun marqueur {section_markers} trouvé, impossible d'extraire les compétences")
        return []

    # Trouver la section "projets" pour déterminer le début de la section des compétences
    projets_start = cleaned_text.find("projets")
    if projets_start == -1 or projets_start >= section_end:
        print("DEBUG: Section 'projets' non trouvée ou après 'langues', utilisant tout le texte avant 'langues'")
        skills_section_text = cleaned_text[:section_end].strip()
    else:
        skills_section_text = cleaned_text[projets_start + len("projets"):section_end].strip()
        print(f"DEBUG: Texte entre 'projets' et '{marker}' (premier 200 chars) : {skills_section_text[:200]}")

    skills = set()
    # Extraire les compétences en traitant les groupes séparés par "et" ou "/"
    words = re.split(r'\s+(?:et|\/)\s*', skills_section_text)  # Sépare par "et" ou "/"
    all_words = []
    for word_group in words:
        all_words.extend(re.split(r'\s+', word_group.strip()))  # Sépare les mots dans chaque groupe

    # Filtrer les mots pour ne garder que ceux qui correspondent aux compétences
    for keyword in SKILL_KEYWORDS:
        escaped_keyword = re.escape(keyword)
        pattern = rf'\b{escaped_keyword}\b'
        if any(re.search(pattern, word) for word in all_words):
            print(f"DEBUG: Compétence trouvée : {keyword}")
            skills.add(keyword)

    final_skills = sorted(list(skills))
    print(f"DEBUG: Compétences finales : {final_skills}")
    return final_skills

if __name__ == "__main__":
    try:
        if len(sys.argv) < 2:
            print(json.dumps({"error": "Texte manquant"}))
            sys.exit(1)
        text = sys.argv[1].strip()
        print(f"DEBUG: Texte brut reçu (premier 200 chars) : {text[:200]}")
        skills = extract_skills_from_section(text)
        print(json.dumps({"skills": skills}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)