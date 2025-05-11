# Étape 1 : Build
FROM node:18 AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    poppler-utils \
    libpoppler-dev \
    libpoppler126 \
    libnss3 \
    && rm -rf /var/lib/apt/lists/*
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
COPY --from=builder /usr/bin/pdftotext /usr/local/bin/pdftotext
COPY --from=builder /usr/lib/x86_64-linux-gnu/libpoppler* /usr/lib/x86_64-linux-gnu/
COPY --from=builder /usr/lib/x86_64-linux-gnu/libnss3.so* /usr/lib/x86_64-linux-gnu/
ENV PATH="/venv/bin:/usr/local/bin:$PATH"
ENV LD_LIBRARY_PATH="/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH"
COPY . .
EXPOSE 4000
CMD ["npm", "start"]