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
        print("DEBUG: Texte vide ou invalide", file=sys.stderr)
        return []
    
    cleaned_text = clean_text(text)
    print(f"DEBUG: Texte nettoyé (premier 200 chars) : {cleaned_text[:200]}", file=sys.stderr)

    # Trouver la section "langues" (qui suit la section des compétences)
    section_end = -1
    for marker in section_markers:
        section_end = cleaned_text.find(marker)
        if section_end != -1:
            print(f"DEBUG: Marqueur '{marker}' trouvé", file=sys.stderr)
            break
    if section_end == -1:
        print(f"DEBUG: Aucun marqueur {section_markers} trouvé, impossible d'extraire les compétences", file=sys.stderr)
        return []

    # Trouver la section "projets" pour déterminer le début de la section des compétences
    projets_start = cleaned_text.find("projets")
    if projets_start == -1 or projets_start >= section_end:
        print("DEBUG: Section 'projets' non trouvée ou après 'langues', utilisant tout le texte avant 'langues'", file=sys.stderr)
        skills_section_text = cleaned_text[:section_end].strip()
    else:
        skills_section_text = cleaned_text[projets_start + len("projets"):section_end].strip()
        print(f"DEBUG: Texte entre 'projets' et '{marker}' (premier 200 chars) : {skills_section_text[:200]}", file=sys.stderr)

    skills = set()
    # Extraire les mots et phrases courtes de la section des compétences
    words = re.split(r'\s+', skills_section_text.strip())
    word_phrases = words + [' '.join(words[i:i+2]) for i in range(len(words)-1)] + [' '.join(words[i:i+3]) for i in range(len(words)-2)]
    print(f"DEBUG: Mots extraits de la section (premiers 20) : {words[:20]}...", file=sys.stderr)

    for keyword in SKILL_KEYWORDS:
        if keyword in word_phrases:
            print(f"DEBUG: Compétence trouvée : {keyword}", file=sys.stderr)
            skills.add(keyword)

    print(f"DEBUG: Compétences finales : {sorted(list(skills))}", file=sys.stderr)
    return sorted(list(skills))

if __name__ == "__main__":
    try:
        if len(sys.argv) < 2:
            print(json.dumps({"error": "Texte manquant"}), file=sys.stderr)
            sys.exit(1)
        text = sys.argv[1].strip()
        print(f"DEBUG: Texte brut reçu (premier 200 chars) : {text[:200]}", file=sys.stderr)
        skills = extract_skills_from_section(text)
        print(json.dumps({"skills": skills}))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)