#!/usr/bin/env python3
import argon2

# Générateur de hash Argon2ID pour Authelia
hasher = argon2.PasswordHasher(
    time_cost=1,
    memory_cost=128,
    parallelism=8,
    hash_len=32,
    salt_len=16
)

passwords = {
    'admin123': 'admin',
    'doctor123': 'doctor', 
    'external123': 'external'
}

for password, user in passwords.items():
    hash_result = hasher.hash(password)
    print(f"{user}: {hash_result}")