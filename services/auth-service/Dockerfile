FROM python:3.11-slim

WORKDIR /app

# Installer les dépendances nécessaires
RUN pip install --no-cache-dir fastapi uvicorn

# Copier le fichier principal uniquement
COPY auth_service.py /app/

# Exposer le port utilisé par le service
EXPOSE 8000

# Lancer le service FastAPI avec uvicorn en mode production
CMD ["uvicorn", "auth_service:app", "--host", "0.0.0.0", "--port", "8000"]