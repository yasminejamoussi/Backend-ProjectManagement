import secrets
import string

def generate_strong_password(length=16):
    if length < 4:
        raise ValueError("La longueur minimale doit être de 4 caractères pour inclure toutes les catégories.")
    
    # Définition des catégories de caractères
    lowercase = string.ascii_lowercase
    uppercase = string.ascii_uppercase
    digits = string.digits
    punctuation = string.punctuation

    # Assurer la présence d'au moins un caractère de chaque type
    password_chars = [
        secrets.choice(lowercase),
        secrets.choice(uppercase),
        secrets.choice(digits),
        secrets.choice(punctuation)
    ]

    # Compléter le reste du mot de passe avec un mélange de tous les caractères
    all_chars = lowercase + uppercase + digits + punctuation
    password_chars.extend(secrets.choice(all_chars) for _ in range(length - 4))
    
    # Mélanger les caractères pour éviter un ordre prévisible
    secrets.SystemRandom().shuffle(password_chars)
    
    return ''.join(password_chars)

if __name__ == "__main__":
    print(generate_strong_password(16))
