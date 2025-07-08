# PACS Stack - Orthanc with OHIF Viewer

## Vue d'ensemble

Cette stack déploie un système PACS (Picture Archiving and Communication System) médical complet basé sur Orthanc avec interface utilisateur OHIF, authentification SSO via Authelia, et viewers médicaux intégrés. La stack est déployée via Docker Compose et peut être recompilée pour différentes plateformes si nécessaire.

## Concept

Le système permet aux professionnels de santé de :
- Stocker et organiser des images médicales au format DICOM
- Consulter et analyser les images via des viewers web avancés
- Partager de façon sécurisée les données médicales avec contrôle d'accès
- Gérer l'authentification et les permissions par groupes d'utilisateurs

## Architecture

```
Internet → Nginx Reverse Proxy → Services Authentifiés
             ↓
         Authelia (SSO)
             ↓
    ┌─────────┬─────────┬─────────┐
    ↓         ↓         ↓         ↓
 Orthanc    OHIF    Stone     VolView
    ↓
PostgreSQL
```

## Services Déployés

| Service | Container | Port | Fonction |
|---------|-----------|------|----------|
| **Nginx** | `pacs-nginx` | 30080 | Reverse proxy + authentification |
| **Authelia** | `pacs-authelia` | 9091 | Authentification SSO |
| **Orthanc** | `pacs-orthanc` | 8042 | Serveur PACS + API DICOM |
| **OHIF** | `pacs-ohif` | 8080 | Viewer DICOM web principal |
| **Auth Service** | `pacs-auth-service` | 8000 | Service d'authentification personnalisé |
| **PostgreSQL** | `pacs-postgres` | 5432 | Base de données principale |
| **Redis** | `pacs-redis` | 6379 | Cache pour sessions Authelia |

## Fonctionnement

### 1. Stockage des Images
- **Orthanc** : Serveur PACS qui stocke les images DICOM
- **PostgreSQL** : Base de données pour métadonnées et index
- **API DICOM-Web** : Interface standardisée pour l'accès aux images

### 2. Authentification
- **Authelia** : Système SSO avec authentification multi-facteur
- **Groupes d'utilisateurs** : admin, doctor, external avec permissions différenciées
- **Tokens API** : Associés aux groupes pour l'accès aux services

### 3. Viewers Médicaux
- **OHIF** : Viewer principal avec fonctionnalités avancées (MPR, annotations)
- **Stone WebViewer** : Viewer haute performance en WebAssembly
- **VolView** : Visualisation volumique 3D

### 4. Sécurité
- **Reverse Proxy** : Nginx avec authentification centralisée
- **Headers de sécurité** : Protection contre XSS, CSRF, etc.
- **Isolation réseau** : Services dans un réseau Docker dédié

## Configuration Système

### Prérequis
- **OS** : Linux (x86_64 recommandé)
- **Docker** : Version 20.10+
- **Docker Compose** : Version 2.0+
- **Ressources** : 4GB RAM minimum, 100GB stockage

### Compatibilité Plateformes
- **Images personnalisées** : Peuvent être recompilées pour ARM64/autres architectures
- **Image Orthanc** : `jodogne/orthanc-plugins:latest` limitée à x86_64
- **Autres services** : PostgreSQL, Redis, Nginx, Authelia supportent multi-plateformes

### Déploiement

1. **Cloner le repository**
```bash
git clone <repo-url>
cd orthanc
```

2. **Configurer les variables d'environnement**
```bash
# Modifier les mots de passe dans docker-compose.yml
# Configurer les utilisateurs dans services/authelia/config/users_database.yml
```

3. **Démarrer la stack**
```bash
docker-compose up -d
```

4. **Accéder aux services**
- Interface principale : `http://localhost:30080/ui/`
- OHIF Viewer : `http://localhost:30080/ohif/`
- Authentification : `http://localhost:30080/auth/`

### Utilisateurs par Défaut

Les groupes d'utilisateurs sont configurés dans `services/authelia/config/users_database.yml` :
- **admin** : Accès complet (lecture/écriture)
- **doctor** : Accès médical (lecture + annotations)
- **external** : Accès limité (lecture seule)

## Flux d'Authentification

1. **Connexion initiale** → Redirection vers Authelia
2. **Authentification** → Validation des credentials
3. **Autorisation** → Vérification des groupes et permissions
4. **Accès** → Injection des headers d'authentification vers les services

## Maintenance

### Logs
```bash
# Logs globaux
docker-compose logs

# Logs par service
docker-compose logs nginx
docker-compose logs authelia
docker-compose logs orthanc
```

### Backup
```bash
# Backup base de données
docker exec pacs-postgres pg_dump -U orthanc orthanc > backup.sql

# Backup volumes
docker run --rm -v orthanc_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz /data
```

### Surveillance
- **Healthchecks** : Docker vérifie automatiquement l'état des services
- **Monitoring** : Logs centralisés pour le debug
- **Alertes** : Notifications en cas de problème

## Sécurité

### Protection des Données
- **Chiffrement** : HTTPS obligatoire pour toutes les communications
- **Authentification** : SSO avec session sécurisée
- **Autorisation** : Contrôle d'accès par groupes et ressources
- **Isolation** : Services dans des containers séparés

### Conformité Médicale
- **Anonymisation** : Outils intégrés pour la protection des données
- **Audit** : Traçabilité des accès et modifications
- **Sauvegarde** : Mécanismes de backup automatisés

## Développement

### Structure des Fichiers
```
├── docker-compose.yml          # Configuration principale
├── services/
│   ├── authelia/              # Configuration Authelia
│   ├── orthanc/               # Configuration Orthanc
│   ├── ohif/                  # Configuration OHIF
│   └── auth-service/          # Service d'authentification
├── reverse-proxy/             # Configuration Nginx
├── scripts/                   # Scripts de gestion
└── docs/                      # Documentation
```

### Personnalisation
- **Thème** : Modification des CSS dans `services/authelia/config/`
- **Traductions** : Ajout de langues dans la configuration OHIF
- **Plugins** : Extension d'Orthanc via plugins personnalisés
- **Multi-plateforme** : Recompilation des images Docker pour ARM64/autres architectures (sauf Orthanc)

## Troubleshooting

### Problèmes Courants
1. **Assets 404** : Vérifier l'ordre des routes Nginx
2. **Authentification** : Vérifier la configuration Authelia
3. **OHIF ne se charge pas** : Vérifier `app-config.js` et `PUBLIC_URL`

### Commandes Utiles
```bash
# Redémarrer tous les services
docker-compose restart

# Vérifier l'état des services  
docker-compose ps

# Tester la connectivité
docker exec pacs-nginx curl -I http://localhost/ui/app/
```

## Évolutions Futures

- **IA médicale** : Intégration d'outils d'analyse IA
- **DICOM SR** : Support des rapports structurés
- **Mobile** : Application mobile pour consultation
- **Télémédecine** : Outils de partage sécurisé

---

*Stack PACS - Orthanc + OHIF + Authelia*
*Optimisée pour Linux x86_64, adaptable à d'autres plateformes*
*Documentation générée le 8 juillet 2025*