import sys
import json
import re

SKILL_KEYWORDS = [
    "react", "angular", "spring", "python", "javascript", "node.js", "html", "css",
    "sql", "mongodb", "devops", "machine learning", "java", "javafx", "mysql", "php",
    "symfony", "flutterflow", "c++", ".net", "microservices", "figma", "c", "mongo",
    "qt", "arduino"
]

def clean_text(text):
    text = re.sub(r'[,\s/]+', ' ', text.lower().strip())
    text = re.sub(r'c\+\+', 'c++', text)  # Ensure C++ is recognized
    text = re.sub(r'mongo\b', 'mongodb', text)  # Normalize "Mongo" to "mongodb"
    return text

def extract_skills(text):
    if not text:
        return []
    
    cleaned_text = clean_text(text)
    skills = set()
    
    # Prioritize skills from "Compétences" sections
    for line in cleaned_text.split('\n'):
        line = line.strip()
        if any(keyword in line for keyword in ["langages de programmation", "bases de données", "frontend", "backend"]):
            skills.update(word for word in re.findall(r'\b\w+\b', line) if word in SKILL_KEYWORDS)
    
    # Fallback to full text search if no skills found
    if not skills:
        for keyword in SKILL_KEYWORDS:
            pattern = r'\b' + re.escape(keyword) + r'\b'
            if re.search(pattern, cleaned_text):
                skills.add(keyword)
    
    return sorted(list(skills))

if __name__ == "__main__":
    text = sys.stdin.read()
    skills = extract_skills(text)
    print(json.dumps({"skills": skills}))