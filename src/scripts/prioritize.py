import spacy
from nltk.sentiment import SentimentIntensityAnalyzer
import nltk
import sys
import json

nltk.download('vader_lexicon')

try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    print("Erreur : Modèle SpaCy non trouvé. Exécutez 'python -m spacy download en_core_web_sm'", file=sys.stderr)
    sys.exit(1)

sia = SentimentIntensityAnalyzer()

DEFAULT_WEIGHTS = {"importance": 0.4, "urgency": 0.4, "effort": 0.2}

def analyze_task(title, description, weights):
    text = f"{title[:100]} {description[:400]}".lower()
    doc = nlp(text)

    sentiment_score = sia.polarity_scores(text)['compound']
    importance = 2
    if sentiment_score > 0.5:
        importance += 2
    elif sentiment_score < -0.5:
        importance = max(importance - 2, 1)
    for token in doc:
        if token.text in ['important', 'critical', 'client', 'key', 'essential']:
            importance = min(importance + 2, 10)
    for ent in doc.ents:
        if ent.label_ == 'ORG' or ent.text.lower() == 'client':
            importance = min(importance + 3, 10)

    urgency = 2
    for token in doc:
        if token.text in ['urgent', 'asap', 'immediate', 'today', 'now']:
            urgency = min(urgency + 3, 10)
        elif token.text in ['tomorrow', 'soon']:
            urgency = min(urgency + 1, 10)

    effort = 2
    for token in doc:
        if token.text in ['simple', 'quick', 'easy']:
            effort = max(effort - 2, 0)
        elif token.text in ['complex', 'hard', 'difficult', 'long']:
            effort = min(effort + 2, 10)

    score = (importance * weights['importance']) + \
            (urgency * weights['urgency']) + \
            ((10 - effort) * weights['effort'])

    priority = 'Low' if score <= 4 else 'Medium' if score <= 5.9 else 'High' if score <= 7.9 else 'Urgent'
    return {
        "importance": importance,
        "urgency": urgency,
        "effort": effort,
        "score": round(score, 2),
        "priority": priority
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Arguments manquants"}), file=sys.stderr)
        sys.exit(1)
    try:
        data = json.loads(sys.argv[1])
        title = data.get('title', '')
        description = data.get('description', '')
        if not title:
            print(json.dumps({"error": "Title is required"}), file=sys.stderr)
            sys.exit(1)
        result = analyze_task(title, description, DEFAULT_WEIGHTS)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)