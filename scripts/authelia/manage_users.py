#!/usr/bin/env python3
"""
Script de gestion des utilisateurs Authelia pour Orthanc PACS
Usage: python3 manage_users.py [command] [options]
"""

import argparse
import yaml
import subprocess
import sys
import os
from pathlib import Path

# Configuration
USERS_FILE = "/volume2/docker/orthanc/authelia/config/users_database.yml"
CONTAINER_NAME = "orthanc-authelia"

def generate_password_hash(password):
    """Génère un hash Argon2ID pour un mot de passe"""
    try:
        result = subprocess.run([
            "docker", "run", "--rm", "authelia/authelia:latest",
            "authelia", "crypto", "hash", "generate", "argon2",
            "--password", password
        ], capture_output=True, text=True, check=True)
        
        # Extraire le hash de la sortie
        for line in result.stdout.split('\n'):
            if line.startswith('Digest: '):
                return line.replace('Digest: ', '').strip()
        
        raise Exception("Hash non trouvé dans la sortie")
        
    except subprocess.CalledProcessError as e:
        print(f"Erreur lors de la génération du hash: {e}")
        return None

def load_users():
    """Charge le fichier users_database.yml"""
    if not os.path.exists(USERS_FILE):
        return {"users": {}}
    
    with open(USERS_FILE, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f) or {"users": {}}

def save_users(data):
    """Sauvegarde le fichier users_database.yml"""
    with open(USERS_FILE, 'w', encoding='utf-8') as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True)

def restart_authelia():
    """Redémarre le conteneur Authelia"""
    try:
        subprocess.run(["docker", "restart", CONTAINER_NAME], check=True)
        print("✅ Authelia redémarré avec succès")
    except subprocess.CalledProcessError:
        print("❌ Erreur lors du redémarrage d'Authelia")

def init_database():
    """Initialise la base de données avec les utilisateurs par défaut"""
    print("🔧 Initialisation de la base de données utilisateurs...")
    
    default_users = {
        "users": {
            "admin@example.com": {
                "displayname": "Administrateur PACS",
                "password": generate_password_hash("admin123"),
                "email": "admin@example.com",
                "groups": ["admin"]
            },
            "doctor@example.com": {
                "displayname": "Médecin",
                "password": generate_password_hash("doctor123"), 
                "email": "doctor@example.com",
                "groups": ["doctor"]
            },
            "external@example.com": {
                "displayname": "Utilisateur Externe",
                "password": generate_password_hash("external123"),
                "email": "external@example.com", 
                "groups": ["external"]
            }
        }
    }
    
    save_users(default_users)
    print("✅ Base de données initialisée avec les utilisateurs par défaut")
    print("👤 Utilisateurs créés:")
    print("   - admin@example.com / admin123 (groupe: admin)")
    print("   - doctor@example.com / doctor123 (groupe: doctor)")
    print("   - external@example.com / external123 (groupe: external)")
    
    restart_authelia()

def add_user(email, password, displayname, groups):
    """Ajoute un nouvel utilisateur"""
    print(f"➕ Ajout de l'utilisateur {email}...")
    
    if not email or '@' not in email:
        print("❌ Email invalide")
        return
    
    if not password or len(password) < 6:
        print("❌ Mot de passe trop court (minimum 6 caractères)")
        return
    
    # Validation des groupes
    valid_groups = ["admin", "doctor", "external"]
    group_list = [g.strip() for g in groups.split(',')]
    
    for group in group_list:
        if group not in valid_groups:
            print(f"❌ Groupe invalide: {group}. Groupes valides: {valid_groups}")
            return
    
    data = load_users()
    
    if email in data["users"]:
        print(f"❌ L'utilisateur {email} existe déjà")
        return
    
    password_hash = generate_password_hash(password)
    if not password_hash:
        print("❌ Erreur lors de la génération du hash")
        return
    
    data["users"][email] = {
        "displayname": displayname or email,
        "password": password_hash,
        "email": email,
        "groups": group_list
    }
    
    save_users(data)
    print(f"✅ Utilisateur {email} ajouté avec succès")
    print(f"   - Nom: {displayname or email}")
    print(f"   - Groupes: {', '.join(group_list)}")
    
    restart_authelia()

def delete_user(email):
    """Supprime un utilisateur"""
    print(f"🗑️  Suppression de l'utilisateur {email}...")
    
    data = load_users()
    
    if email not in data["users"]:
        print(f"❌ L'utilisateur {email} n'existe pas")
        return
    
    del data["users"][email]
    save_users(data)
    print(f"✅ Utilisateur {email} supprimé avec succès")
    
    restart_authelia()

def change_password(email, new_password):
    """Change le mot de passe d'un utilisateur"""
    print(f"🔑 Changement de mot de passe pour {email}...")
    
    if len(new_password) < 6:
        print("❌ Mot de passe trop court (minimum 6 caractères)")
        return
    
    data = load_users()
    
    if email not in data["users"]:
        print(f"❌ L'utilisateur {email} n'existe pas")
        return
    
    password_hash = generate_password_hash(new_password)
    if not password_hash:
        print("❌ Erreur lors de la génération du hash")
        return
    
    data["users"][email]["password"] = password_hash
    save_users(data)
    print(f"✅ Mot de passe changé pour {email}")
    
    restart_authelia()

def list_users():
    """Liste tous les utilisateurs"""
    print("👥 Liste des utilisateurs:")
    
    data = load_users()
    
    if not data["users"]:
        print("   Aucun utilisateur trouvé")
        return
    
    for email, user_data in data["users"].items():
        groups = ", ".join(user_data.get("groups", []))
        displayname = user_data.get("displayname", "")
        print(f"   📧 {email}")
        print(f"      Nom: {displayname}")
        print(f"      Groupes: {groups}")
        print()

def main():
    parser = argparse.ArgumentParser(description="Gestionnaire d'utilisateurs Authelia")
    subparsers = parser.add_subparsers(dest='command', help='Commandes disponibles')
    
    # Commande init
    subparsers.add_parser('init', help='Initialiser la base de données avec les utilisateurs par défaut')
    
    # Commande add
    add_parser = subparsers.add_parser('add', help='Ajouter un utilisateur')
    add_parser.add_argument('email', help='Email de l\'utilisateur')
    add_parser.add_argument('password', help='Mot de passe')
    add_parser.add_argument('--name', help='Nom d\'affichage', default='')
    add_parser.add_argument('--groups', help='Groupes séparés par des virgules', default='external')
    
    # Commande delete
    del_parser = subparsers.add_parser('delete', help='Supprimer un utilisateur')
    del_parser.add_argument('email', help='Email de l\'utilisateur')
    
    # Commande password
    pwd_parser = subparsers.add_parser('password', help='Changer le mot de passe')
    pwd_parser.add_argument('email', help='Email de l\'utilisateur')
    pwd_parser.add_argument('new_password', help='Nouveau mot de passe')
    
    # Commande list
    subparsers.add_parser('list', help='Lister tous les utilisateurs')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    print(f"🔧 Gestionnaire d'utilisateurs Authelia - {args.command.upper()}")
    print("=" * 50)
    
    if args.command == 'init':
        init_database()
    elif args.command == 'add':
        add_user(args.email, args.password, args.name, args.groups)
    elif args.command == 'delete':
        del_parser = input(f"Êtes-vous sûr de vouloir supprimer {args.email}? (y/N): ")
        if del_parser.lower() == 'y':
            delete_user(args.email)
        else:
            print("❌ Suppression annulée")
    elif args.command == 'password':
        change_password(args.email, args.new_password)
    elif args.command == 'list':
        list_users()

if __name__ == "__main__":
    main()