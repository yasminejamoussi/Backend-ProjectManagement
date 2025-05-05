# Étape 1 : Build
FROM node:18 AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv
RUN python3 -m venv /venv && \
    /venv/bin/pip install --upgrade pip && \
    /venv/bin/pip install pandas pymongo scikit-learn spacy nltk flask pdfplumber && \
    /venv/bin/python -m spacy download en_core_web_sm
COPY package*.json ./
RUN npm install && npm install brain.js@1.6.0

# Étape 2 : Image finale
FROM node:18
WORKDIR /app
COPY --from=builder /venv /venv
COPY --from=builder /app/node_modules ./node_modules
ENV PATH="/venv/bin:$PATH"
COPY . .
EXPOSE 4000
CMD ["node", "src/server.js"]