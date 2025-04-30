import spacy
import sys
import json
import nltk
import re

nltk.download("vader_lexicon")

try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    print(json.dumps({"error": "Modèle SpaCy non trouvé. Exécutez 'python -m spacy download en_core_web_sm'"}), file=sys.stderr)
    sys.exit(1)

# Liste de compétences prédéfinies
SKILL_KEYWORDS = [
    "react", "javascript", "python", "sql", "java", "project management",
    "node.js", "node",  # Ajout de "node" comme variante
    "html", "css", "typescript", "mongodb", "docker", "aws",
    "angular", "vue.js", "git", "jenkins", "kubernetes",
    "ingénierie informatique", "développement logiciel", "gestion de projet",
    "ui design", "ux design", "api development", "backend development", "frontend development",
    "database design", "cloud computing", "machine learning", "data analysis", "devops"
]

def clean_text(text):
    """Nettoie le texte en enlevant les virgules et en normalisant les espaces."""
    text = re.sub(r'[,\s]+', ' ', text)  # Remplace les virgules et espaces multiples par un seul espace
    return text.strip()

def extract_skills(text):
    if not text:
        return []
    
    # Nettoyer le texte avant traitement
    cleaned_text = clean_text(text.lower())
    print(f"Texte nettoyé : {cleaned_text}")  # Log pour déboguer
    doc = nlp(cleaned_text)
    skills = set()

    # Recherche directe des mots-clés dans le texte nettoyé (méthode plus robuste)
    for keyword in SKILL_KEYWORDS:
        if keyword in cleaned_text:
            skills.add(keyword)
            print(f"Compétence détectée (recherche directe) : {keyword}")  # Log

    # Recherche des mots-clés via spaCy (pour gérer les cas complexes)
    for token in doc:
        print(f"Token spaCy : {token.text}")  # Log pour déboguer
        if token.text in SKILL_KEYWORDS:
            skills.add(token.text)
            print(f"Compétence détectée (token spaCy) : {token.text}")  # Log
        for keyword in SKILL_KEYWORDS:
            if token.text in keyword.split('.'):
                skills.add(keyword)
                print(f"Compétence détectée (composé spaCy) : {keyword}")  # Log

    # Recherche des entités potentielles
    for ent in doc.ents:
        print(f"Entité spaCy : {ent.text}")  # Log pour déboguer
        if ent.text in SKILL_KEYWORDS:
            skills.add(ent.text)
            print(f"Compétence détectée (entité spaCy) : {ent.text}")  # Log

    return list(skills)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Texte manquant"}), file=sys.stderr)
        sys.exit(1)

    try:
        text = sys.argv[1]
        skills = extract_skills(text)
        print(json.dumps({"skills": skills}))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)