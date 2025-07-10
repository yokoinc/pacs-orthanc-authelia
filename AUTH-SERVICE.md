# Auth Service - Documentation technique

## Vue d'ensemble

Le **Auth Service** est un composant FastAPI qui gère l'authentification et l'autorisation avancées pour PAX-ORTHANC. Il sert d'intermédiaire entre Authelia (authentification primaire) et Orthanc (serveur PACS), en gérant notamment les tokens de partage externe et les permissions granulaires.

## Architecture et rôle

### Position dans l'architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      FLUX D'AUTHENTIFICATION                        │
├─────────────────────────────────────────────────────────────────────┤
│   Utilisateur                                                       │
│      ↓                                                              │
│  ┌─────────────────┐                                                │
│  │   NIVEAU 1      │  Authelia (Authentification primaire)          │
│  │   Authelia      │  • Vérification utilisateur/mot de passe       │
│  │                 │  • Gestion des sessions/expiration             │
│  └─────────────────┘  • Attribution des rôles (admin/doctor ...)    │
│      ↓                                                              │
│  ┌─────────────────┐                                                │
│  │  NIVEAU 2       │  Auth Service (ce composant)                   │
│  │  Auth-Service   │  • Génération de tokens/partage externe        │
│  │                 │  • Validation des permissions par rôle         │ 
│  └─────────────────┘  • Interface de gestion des tokens             │
│      ↓                                                              │
│  ┌─────────────────┐                                                │
│  │  NIVEAU 3       │  Plugin d'autorisation Orthanc                 │
│  │  Orthanc Auth   │  • Contrôle d'accès granulaire                 │
│  │                 │  • Validation des requêtes DICOM               │
│  └─────────────────┘                                                │
└─────────────────────────────────────────────────────────────────────┘
```

### Responsabilités principales

1. **Validation des tokens** : Vérifie la validité des tokens utilisateur et de partage
2. **Gestion des permissions** : Contrôle l'accès aux ressources selon les rôles
3. **Interface d'administration** : Fournit une interface web pour gérer les tokens
4. **Compteurs d'usage** : Suit l'utilisation des tokens de partage
5. **Audit et logs** : Journalise toutes les actions d'authentification

## Technologies utilisées

### Stack technique

- **Framework** : FastAPI 
- **Stockage** : Redis (tokens, sessions, audit)
- **Authentification** : HTTP Basic + Headers Authelia
- **Interface** : HTML/JavaScript + Font Awesome
- **Containerisation** : Docker avec Python 3.11

### Dépendances

```python
# requirements.txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
redis==5.0.1
```

## Configuration

### Variables d'environnement

#### Authentification de base
```env
AUTH_USERNAME=share-user                    # Utilisateur API
AUTH_PASSWORD=change_this_password_in_production
```

#### Configuration Redis
```env
REDIS_HOST=redis                           # Hôte Redis
REDIS_PORT=6379                            # Port Redis
REDIS_DB=0                                 # Base de données Redis
```

#### Configuration des tokens
```env
DEFAULT_TOKEN_MAX_USES=50                  # Utilisations max par token
DEFAULT_TOKEN_VALIDITY_SECONDS=604800      # Validité (7 jours)
CACHE_VALIDITY_USER_SESSION=300            # Cache session utilisateur (5min)
CACHE_VALIDITY_SHARE_TOKEN=60              # Cache token partage (1min)
UNLIMITED_TOKEN_DURATION=31536000          # Durée tokens illimités (1 an)
```

#### Interface utilisateur
```env
UI_MSG_INVALID_TOKEN=Aucun token fourni.
UI_MSG_EXPIRED_TOKEN=Ce lien de partage n'est plus valide.
UI_MSG_NO_STUDY=Aucune étude associée à ce token.
UI_MSG_USAGE_LIMIT=Ce lien de partage a atteint sa limite d'utilisation.
```

## APIs principales

### 1. Validation de tokens (`POST /tokens/validate`)

**Utilisé par** : Plugin d'autorisation Orthanc

```python
# Entrée
{
    "token-value": "admin-token|doctor-token|uuid-token",
    "level": "study|series|instance|patient|system",
    "method": "get|post|put|delete",
    "orthanc-id": "...",
    "dicom-uid": "...",
    "uri": "/api/studies/..."
}

# Sortie
{
    "granted": true|false,
    "validity": 300  # Durée cache en secondes
}
```

**Logique de validation :**

1. **Tokens utilisateur** (admin/doctor/external) : Vérification des permissions par rôle
2. **Tokens de partage** : Vérification dans Redis + incrémentation du compteur
3. **Vérification des ressources** : Contrôle que le token donne accès à la ressource demandée

### 2. Création de tokens (`POST/PUT /tokens/{type}`)

**Utilisé par** : Plugin Authorization d'Orthanc (Explorer 2)

```python
# Entrée
{
    "Id": "request-id",
    "Resources": [
        {
            "OrthancId": "orthanc-uuid",
            "DicomUid": "1.2.840...",
            "Level": "study"
        }
    ],
    "ValidityDuration": 604800  # secondes (0 = illimité)
}

# Sortie
{
    "Token": "uuid-token",
    "Url": "https://pacs.example.com/share/?token=uuid-token"
}
```

### 3. Gestion des tokens (`GET|DELETE /tokens`)

**Interface d'administration** accessible via `/auth/tokens/manage`

- **Liste** : `GET /tokens` - Retourne tous les tokens actifs
- **Révocation** : `DELETE /tokens/{id}` - Révoque un token spécifique
- **Statistiques** : `GET /tokens/stats` - Métriques d'usage

## Stockage Redis

### Structure des données

#### Tokens de partage
```
Clé: token:{uuid}
Valeur: {
    "token_type": "viewer-instant-link",
    "resources": [...],
    "role": "external-role",
    "expires_at": 1234567890,
    "created_at": 1234567890,
    "max_uses": 50,
    "current_uses": 15
}
TTL: Calculé selon expires_at
```

#### Logs d'audit
```
Clé: audit:revoke:{token_id}:{timestamp}
Valeur: {
    "action": "token_revoked",
    "token_id": "uuid",
    "revoked_by": "admin@example.com",
    "revoked_at": 1234567890,
    "token_uses": 15
}
TTL: AUDIT_RETENTION_DAYS (90 jours)
```

## Système de permissions

### Rôles et permissions

| Rôle | Permissions | Description |
|------|-------------|-------------|
| **admin-role** | Toutes | Accès complet au système |
| **doctor-role** | `view`, `download`, `upload`, `share`, `send`, `edit-labels` | Accès médical standard |
| **external-role** | `view`, `download` | Lecture seule via tokens |

### Mapping Authelia → Auth Service

```python
# Configuration nginx
map $groups $auth_token {
    ~admin    "admin-token";        # Groupe Authelia -> Token role
    ~doctor   "doctor-token";
    ~external "external-token";
    default   "";
}
```

## Interface web

### Token Manager (`/auth/tokens/manage`)

Interface d'administration accessible aux administrateurs :

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MANAGER DE TOKENS                                │
├─────────────────────────────────────────────────────────────────────┤
│  Token ID    │  Utilisations  │  Expiration  │  Actions             │
│  ─────────   │  ────────────  │  ──────────  │  ──────────          │
│  abc123...   │  15/50         │  2h 30m      │  [Révoquer] [Stats]  │
│  def456...   │  03/50         │  1h 45m      │  [Révoquer] [Stats]  │
│  ghi789...   │  48/50         │  15m         │  [Révoquer] [Stats]  │
├─────────────────────────────────────────────────────────────────────┤
│  [Créer nouveau token]  [Exporter logs]  [Purger expirés]           │
└─────────────────────────────────────────────────────────────────────┘
```

### Fonctionnalités

- **Auto-refresh** : Mise à jour automatique toutes les 30 secondes
- **Révocation en temps réel** : Suppression immédiate des tokens
- **Statistiques** : Métriques d'usage et répartition par type
- **Responsive** : Interface adaptative mobile/desktop

## Intégration avec nginx

### Configuration nginx

```nginx
# Validation des tokens
location /authelia {
    internal;
    proxy_pass http://authelia:9091/api/verify;
    proxy_set_header X-Original-Method $request_method;
    proxy_set_header X-Original-URL $scheme://$http_host$request_uri;
}

# Routes protégées par tokens
location /ohif/ {
    auth_request /authelia;
    
    # Injection du token dans les en-têtes
    set $auth_token "";
    access_by_lua_block {
        # Extraction du token depuis les paramètres ou headers
        local token = ngx.var.arg_token or ngx.var.http_authorization
        if token then
            ngx.var.auth_token = token
        end
    }
    
    proxy_set_header Authorization "Bearer $auth_token";
    proxy_pass http://ohif:8080/ohif/;
}
```

## Sécurité

### Mesures de sécurité

1. **Validation stricte** : Vérification de tous les tokens et permissions
2. **Expiration automatique** : TTL Redis pour tous les tokens
3. **Limitation d'usage** : Compteur d'utilisations par token
4. **Audit complet** : Journalisation de toutes les actions
5. **Isolation** : Tokens de partage en lecture seule uniquement

### Headers d'authentification

```http
# Headers Authelia injectés par nginx
Remote-User: admin@example.com
Remote-Groups: admin,users
Remote-Name: Administrator
Remote-Email: admin@example.com
```

## Monitoring et logs

### Logs d'application

```python
# Configuration des logs
LOG_LEVEL=WARNING  # DEBUG, INFO, WARNING, ERROR, CRITICAL

# Exemples de logs
2024-01-15 10:30:45 - auth-service - INFO - Token validated: abc123 for study access
2024-01-15 10:31:12 - auth-service - WARNING - Token usage limit reached: def456
2024-01-15 10:32:00 - auth-service - INFO - Token revoked: ghi789 by admin@example.com
```

### Métriques disponibles

- **Tokens actifs** : Nombre total de tokens valides
- **Répartition par type** : `viewer-instant-link`, `study-share`, etc.
- **Usage** : Répartition low/medium/high utilisation
- **Historique** : Logs d'audit avec rétention configurable

## Déploiement

### Docker

```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi uvicorn redis
COPY auth_service.py /app/
COPY static/ /app/static/
COPY templates/ /app/templates/
EXPOSE 8000
CMD ["uvicorn", "auth_service:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Docker Compose

```yaml
auth-service:
  build:
    context: ./services/auth-service
  container_name: pax-auth-service
  restart: unless-stopped
  environment:
    - AUTH_USERNAME=${AUTH_USERNAME}
    - AUTH_PASSWORD=${AUTH_PASSWORD}
    - REDIS_HOST=${REDIS_HOST}
    - REDIS_PORT=${REDIS_PORT}
  networks:
    - pax-network
```

## Maintenance

### Tâches de maintenance

1. **Purge des tokens expirés** : Automatique via TTL Redis
2. **Nettoyage des logs** : Purge automatique après `AUDIT_RETENTION_DAYS`
3. **Monitoring Redis** : Surveillance de l'utilisation mémoire
4. **Backup** : Sauvegarde périodique des tokens actifs si nécessaire

### Troubleshooting

#### Erreurs courantes

```bash
# Test de connectivité Redis
redis-cli -h redis ping

# Vérification des tokens actifs
redis-cli -h redis KEYS "token:*"

# Test d'API
curl -u share-user:password http://auth-service:8000/health
```

#### Logs de débogage

```env
# Activer le mode debug
LOG_LEVEL=DEBUG
JS_DEBUG_MODE=true
```

## Évolutions futures

### Améliorations possibles

1. **Base de données** : Migration vers PostgreSQL pour tokens persistants
2. **Cache distribué** : Support Redis Cluster
3. **Métriques avancées** : Intégration Prometheus/Grafana
4. **API versioning** : Support versions multiples de l'API
5. **WebSockets** : Notifications temps réel pour l'interface admin

---

**Auth Service** - Composant d'authentification avancée pour PAX-ORTHANC