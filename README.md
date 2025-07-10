# PAX-ORTHANC

## Solution PACS complète avec authentification multi-niveaux

**PAX-ORTHANC ** est une solution PACS (Picture Archiving and Communication System) conteneurisée, conçue pour les infrastructures de petite à moyenne taille.

## Table des matières

- [Architecture technique](#architecture-technique)
- [Sécurité multi-niveaux](#sécurité-multi-niveaux)
- [Système de partage de liens](#système-de-partage-de-liens)
- [Schéma des routes](#schéma-des-routes)
- [Installation et configuration](#installation-et-configuration)
- [Gestion des utilisateurs](#gestion-des-utilisateurs)
- [Gestion des tokens](#gestion-des-tokens)
- [Justifications techniques](#justifications-techniques)
- [Crédits et remerciements](#crédits-et-remerciements)

## Architecture technique

### Stack technologique

```
┌───────────────────────────────────────────────────────────────┐
│                         PAX-ORTHANC                           │
├───────────────────────────────────────────────────────────────┤
│  nginx (Reverse Proxy)                                        │
├───────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐  │
│  │ Authelia        │ │ Auth-Service    │ │ Orthanc         │  │
│  │ (Auth primaire) │ │ (Token manager) │ │ (PACS server)   │  │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘  │
├───────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐  │
│  │ PostgreSQL      │ │ Redis           │ │ OHIF Viewer     │  │
│  │ (Database)      │ │ (Sessions)      │ │ (Interface)     │  │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

### Services conteneurisés

| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| **nginx** | `pax-nginx` | 80 | Reverse proxy principal |
| **orthanc** | `pax-orthanc` | 8042* | Serveur PACS et API DICOM |
| **ohif** | `pax-ohif` | 8080* | Visualiseur d'images médicales |
| **authelia** | `pax-authelia` | 9091* | Authentification et autorisation |
| **auth-service** | `pax-auth-service` | 8000* | Gestion avancée des tokens |
| **postgres** | `pax-postgres` | 5432* | Base de données principale |
| **redis** | `pax-redis` | 6379* | Cache et stockage des sessions |

* Port non exposé en externe

### Réseau Docker

**Réseau bridge** : `pax-network`  
Tous les services communiquent via ce réseau interne sécurisé.
Port nginx, seul port exposé en externe

## Sécurité multi-niveaux

### Architecture de sécurité à 3 niveaux

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
│  │  NIVEAU 2       │  Service d'authentification personnalisé       │
│  │  Auth-Service   │  • Génération de tokens/partage externe study  │
│  │                 │  • Definiton permissions des roles / orthanc   │ 
│  └─────────────────┘                                    & explorer  │
│      ↓                                                              │
│  ┌─────────────────┐                                                │
│  │  NIVEAU 3       │  Plugin d'autorisation Orthanc                 │
│  │  Orthanc Auth   │  • Contrôle d'accès granulaire                 │
│  │                 │  • Validation des requêtes DICOM               │
│  └─────────────────┘                                                │
│      ↓                                                              │
│   Accès aux données DICOM                                           │
└─────────────────────────────────────────────────────────────────────┘
```

### Mapping des tokens par rôle

```nginx
map $groups $auth_token {
    ~admin    "admin-token";        # Accès complet administrateur
    ~doctor   "doctor-token";       # Accès médical pour docteurs
    ~external "external-token";     # Accès limité utilisateurs externes
    default   "";                   # Aucun accès par défaut
}
```

## Système de partage de liens

### Fonctionnalités du système de tokens

- **Limitation d'usage** :             Maximum 50 utilisations par token (par défaut)
- **Durée de vie configurable** :      Expiration paramétrable
- **Révocation instantanée** :         Annulation en temps réel
- **Journalisation complète** :        Traçabilité des accès
- **Interface de gestion** :           Panel d'administration dédié

### Sécurité des liens externes

```
┌─────────────────────────────────────────────────────────────────────┐
│                      FLUX DE PARTAGE SÉCURISÉ                       │
├─────────────────────────────────────────────────────────────────────┤
│   Utilisateur externe                                               │
│      ↓                                                              │
│  ┌─────────────────┐                                                │
│  │  Vérification   │  • Validation du token                         │
│  │  Token          │  • Vérification des utilisations restantes     │
│  │                 │  • Contrôle de l'expiration                    │
│  └─────────────────┘                                                │
│      ↓                                                              │
│  ┌─────────────────┐                                                │
│  │   Filtrage      │  • Aucun accès direct au backend               │
│  │   Nginx         │  • Limitation des endpoints                    │
│  │                 │  • Journalisation des accès                    │
│  └─────────────────┘                                                │
│      ↓                                                              │
│  ┌─────────────────┐                                                │
│  │  Accès limité   │  • Visualisation uniquement                    │
│  │  aux études     │  • Pas d'accès aux API administratives         │
│  │                 │  • Décompte des utilisations                   │
│  └─────────────────┘                                                │
└─────────────────────────────────────────────────────────────────────┘
```

## Schéma des routes

### Routes publiques (sans authentification)

| Route | Cible | Description |
|-------|--------|-------------|
| `/` | Redirect → `/ui/app/` | Redirection racine |
| `/static/` | `authelia:9091` | Assets statiques Authelia |
| `/ohif/*.{js,css,png,jpg,gif,svg,ico,webp,json,gz,wasm,woff,woff2,ttf,eot,map}` | `ohif:8080` | Assets OHIF |
| `/app/` | `ohif:8080/ohif/` | Assets OHIF via app path |

### Routes de partage (authentification par token)

| Route | Cible | Description |
|-------|--------|-------------|
| `/share/` | `auth-service:8000` | Interface d'accès aux études partagées |
| `/share/api/` | `orthanc:8042/api/` | API depuis l'interface de partage |
| `/share/{studies,series,instances,patients}` | `orthanc:8042` | Ressources DICOM partagées |

### Routes protégées (authentification Authelia)

| Route | Cible | Description |
|-------|--------|-------------|
| `/ui/` | `orthanc:8042` | Interface web Orthanc |
| `/stone-webviewer/` | `orthanc:8042` | Stone WebViewer (WebAssembly) |
| `/volview/` | `orthanc:8042` | VolView WebViewer (3D volumétrique) |
| `/ohif/` | `ohif:8080/ohif/` | OHIF Viewer principal |

### API DICOM (authentification complète)

| Route | Cible | Authentification | Description |
|-------|--------|------------------|-------------|
| `/wado` | `orthanc:8042` | Authelia + Token | WADO (Web Access to DICOM Objects) |
| `/dicom-web` | `orthanc:8042` | Authelia + Token | Endpoints standard DICOMweb |
| `/{instances,patients,series,studies}` | `orthanc:8042` | Authelia | API REST Orthanc |
| `/{tools,system,statistics,modalities,peers,plugins,jobs,changes,exports,preview}` | `orthanc:8042` | Authelia | API d'administration |

### Routes d'authentification

| Route | Cible | Description |
|-------|--------|-------------|
| `/auth/` | `authelia:9091` | Interface d'authentification |
| `/auth/tokens/manage` | `auth-service:8000` | Gestion des tokens |
| `/auth/tokens/stats` | `auth-service:8000` | Statistiques des tokens |
| `/auth/tokens/` | `auth-service:8000` | Opérations CRUD tokens |
| `/api/` | `authelia:9091/api/` | API Authelia |
| `/authelia/` | `authelia:9091/api/verify` | Vérification interne |

## Installation et configuration

### Prérequis

- Docker et Docker Compose
- Reverse proxy HTTPS (Cloudflare recommandé)
- PostgreSQL (conteneurisé)
- Redis (conteneurisé)

### Variables d'environnement critiques

**Obligatoires** pour le fonctionnement du système :

#### Configuration PostgreSQL
```env
POSTGRES_DB=orthanc
POSTGRES_USER=orthanc
POSTGRES_PASSWORD=changeme_in_production
```

#### Configuration des utilisateurs
```env
AUTH_USERNAME=admin
AUTH_PASSWORD=changeme_in_production
```

#### Configuration réseau
```env
NGINX_EXTERNAL_PORT=30080
OHIF_PUBLIC_URL=/ohif/
OHIF_HTTPS=false
```

#### Configuration du domaine
```env
DOMAIN=votre-domaine.com (seul un domaine ≠ localhost et déclaré en https fonctionnera)
TZ=Europe/Paris
```

### Démarrage

```bash
# Cloner le projet
git clone https://github.com/votre-repo/pax-ma-stack.git
cd pax-ma-stack

# Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos paramètres

# Démarrer les services
docker-compose up -d

# Vérifier l'état des services
docker-compose ps
```

### Important

**Tout changement sur les variables d'environnement nécessite un `docker-compose restart` complet (pas seulement `restart`).**

## Gestion des utilisateurs

### Script de gestion automatisé

Le système inclut un script Python pour gérer facilement les utilisateurs Authelia :

```bash
# Initialiser avec des utilisateurs par défaut
python3 services/authelia/scripts/manage_users.py init

# Ajouter un nouvel utilisateur
python3 services/authelia/scripts/manage_users.py add doctor@hopital.fr password123 \
    --name "Dr. Martin" --groups doctor

# Lister tous les utilisateurs
python3 services/authelia/scripts/manage_users.py list

# Changer un mot de passe
python3 services/authelia/scripts/manage_users.py password doctor@hopital.fr nouveaumotdepasse

# Supprimer un utilisateur
python3 services/authelia/scripts/manage_users.py delete doctor@hopital.fr
```

### Groupes d'utilisateurs disponibles

| Groupe | Accès | Description |
|--------|-------|-------------|
| `admin` | **Complet** | Administration PACS, gestion tokens, accès total |
| `doctor` | **Médical** | Visualisation, upload DICOM, création tokens |
| `external` | **Lecture seule** | Visualisation limitée via tokens uniquement |

### Utilisateurs par défaut (après init)

```bash
# Créés automatiquement avec le script init
admin@example.com    / admin123    (groupe: admin)
doctor@example.com   / doctor123   (groupe: doctor) 
external@example.com / external123 (groupe: external)
```

**⚠️ Important :** Changez les mots de passe par défaut en production !

### Gestion manuelle (alternative)

Si vous préférez modifier directement le fichier YAML :

```yaml
# services/authelia/config/users_database.yml
users:
  nouveau@hopital.fr:
    displayname: "Nouvel Utilisateur"
    password: "$argon2id$v=19$m=128,t=1,p=8$..."  # Hash généré
    email: "nouveau@hopital.fr"
    groups: ["doctor"]
```

**Note :** Les mots de passe doivent être hashés en Argon2ID. Utilisez le script pour éviter les erreurs.

## Gestion des tokens

### Manager de tokens intégré

Le système inclut un gestionnaire de tokens avancé accessible via `/auth/tokens/manage` :

#### Fonctionnalités
- **Création de tokens** : Génération avec paramètres personnalisés
- **Limitation d'usage** : Maximum 50 utilisations par token
- **Suivi en temps réel** : Monitoring des accès
- **Révocation instantanée** : Annulation des tokens compromis
- **Journalisation** : Historique détaillé des actions

#### Interface de gestion
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

### Stockage Redis

**Redis centralise** toutes les données de session et de tokens :

- **Sessions utilisateur** : Données d'authentification Authelia
- **Tokens actifs** : Base de données des tokens générés
- **Compteurs d'usage** : Nombre d'utilisations par token
- **Métadonnées** : Timestamps, IPs, user-agents
- **Logs d'audit** : Historique des accès et révocations

#### Configuration Redis
```env
REDIS_HOST=pax-redis
REDIS_PORT=6379
REDIS_DB=0
CACHE_VALIDITY_USER_SESSION=3600
CACHE_VALIDITY_SHARE_TOKEN=7200
```

## 🎯 Justifications techniques

### Pourquoi Authelia au lieu de Keycloak ?

| Critère | Authelia | Keycloak |
|---------|----------|----------|
| **Complexité** | ✅ Simple à configurer | ❌ Configuration complexe |
| **Ressources** | ✅ Léger (< 50MB RAM) | ❌ Lourd (> 512MB RAM) |
| **Infrastructure** | ✅ Adapté NAS entreprise | ❌ Surdimensionné |
| **Maintenance** | ✅ Minimal | ❌ Expertise requise |
| **Intégration** | ✅ Rapide | ❌ Longue |

### Architecture de sécurité granulaire

Le système implémente **3 niveaux d'authentification** pour une sécurité maximale :

1. **Authelia** : Authentification utilisateur standard
2. **Auth-Service** : Gestion des tokens et permissions
3. **Plugin Orthanc** : Contrôle d'accès au niveau DICOM

### Gestion des certificats SSL

**Configuration actuelle** : 
- Gestion SSL externalisée (Cloudflare/Reverse proxy)
- HTTP interne entre containers
- Certificats gérés en amont

**Évolution future** : 
- Gestion SSL interne possible
- Let's Encrypt intégré
- Certificats auto-renouvelés

## 📊 Performances et monitoring

### Optimisations implémentées

- **Compression gzip** : Réduction de 70% des transferts
- **Cache des assets** : 1 an pour les fichiers statiques
- **Streaming optimisé** : Gestion des gros fichiers DICOM
- **Connection pooling** : Réutilisation des connexions
- **Buffering adaptatif** : Ajustement selon la taille des fichiers

### Métriques de monitoring

Le système intègre des métriques pour :
- Nombre de tokens actifs
- Utilisation des tokens
- Temps de réponse des API
- Charge des services
- Erreurs d'authentification

## Audit et conformité

### Journalisation complète

Le système journalise **tous les accès** :
- Authentifications réussies/échouées
- Utilisation des tokens
- Accès aux études DICOM
- Actions administratives
- Révocations de tokens

### Rétention des données

```env
AUDIT_RETENTION_DAYS=90  # Rétention des logs d'audit
```

### Conformité médicale

- **Traçabilité** : Tous les accès sont logués
- **Révocation** : Tokens révocables instantanément
- **Limitation** : Accès limité dans le temps
- **Isolation** : Aucun accès direct au backend

## Développement et contribution

### Structure du projet

```
pax-ma-stack/
├── docker-compose.yml         # Orchestration des services
├── .env.example               # Variables d'environnement
├── .gitignore                 # Fichiers à exclure du versioning
├── services/
│   ├── auth-service/          # Service d'authentification
│   ├── authelia/              # Configuration Authelia
│   ├── orthanc/               # Configuration Orthanc
│   ├── ohif/                  # Configuration OHIF
│   └── reverse-proxy/         # Configuration Nginx
│       ├── nginx.conf         # Configuration principale
│       └── conf.d/            # Configurations spécifiques
└── sources/                   # Sources des plugins
```

### Tests et validation

```bash
# Tester l'authentification
curl -X POST http://localhost/auth/api/verify

# Tester l'API Orthanc
curl -H "Authorization: Bearer token" http://localhost/api/system

# Tester le partage
curl http://localhost/share/TOKEN_ID
```

## Crédits et remerciements

### Remerciements principaux

- **Sébastien Jodogne** : Créateur et maintainer principal d'Orthanc
- **Équipe Orthanc** : Développement du serveur PACS open source
- **Université de Louvain** : Hébergement du projet Orthanc depuis ses débuts
- **Communauté OHIF** : Développement du visualiseur web open source
- **Équipe Authelia** : Solution d'authentification moderne

### Licences et sources

- **Orthanc** : GNU General Public License v3.0
- **OHIF** : MIT License
- **Authelia** : Apache License 2.0
- **PAX-MA-STACK** : MIT License

### Sources officielles et documentation

**Orthanc - Sources officielles :**
- **Site officiel** : [orthanc-server.com](https://www.orthanc-server.com/)
- **Documentation complète** : [Orthanc Book](https://orthanc.uclouvain.be/book/index.html)
- **Dépôts Mercurial officiels** : [hg.orthanc-server.com](https://hg.orthanc-server.com/)
- **GitHub OrthancTeam** : [github.com/orthanc-team](https://github.com/orthanc-team)
- **GitHub OrthancServer** : [github.com/orthanc-server](https://github.com/orthanc-server)

**Autres sources :**
- **OHIF** : [ohif.org](https://ohif.org/) - Visualiseur médical open source
- **Authelia** : [authelia.com](https://authelia.com/) - Solution d'authentification

Ce projet s'inspire des bonnes pratiques et de la documentation officielle d'Orthanc, sans reprendre directement le code source. L'architecture d'authentification et d'autorisation a été conçue en étudiant les mécanismes internes d'Orthanc et en adaptant les solutions aux besoins spécifiques des infrastructures de petite et moyenne taille.

---

## Licence

MIT License - Voir le fichier `LICENSE` pour plus de détails.

## Support et contribution

- **Issues** : [GitHub Issues](https://github.com/yokoinc/pacs-orthanc-authelia/issues)
- **Discussions** : [GitHub Discussions](https://github.com/yokoinc/pacs-orthanc-authelia/discussions)

---

*PAX-ORTHANC - Une solution PACS moderne, sécurisée et scalable pour les infrastructures médicales.*
