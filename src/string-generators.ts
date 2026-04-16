const USERNAME_SYMBOLS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const USERNAME_LENGTH = 10;
const PASSWORD_SYMBOLS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
const PASSWORD_LENGTH = 20;

export function generatePassword(): string {
  return generateRandomString(PASSWORD_SYMBOLS, PASSWORD_LENGTH);
}

export function generateUsername(): string {
  return generateRandomString(USERNAME_SYMBOLS, USERNAME_LENGTH);
}

function generateRandomString(symbols: string, length: number): string {
  return Array.from({ length }, () => symbols[Math.floor(Math.random() * symbols.length)]).join('');
}
