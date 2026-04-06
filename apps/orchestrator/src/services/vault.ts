import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

interface Credential {
  username: string;
  password: string;
}

interface VaultData {
  [site: string]: Credential;
}

interface VaultFile {
  salt: string;
  iv: string;
  authTag: string;
  data: string;
}

const VAULT_DIR = join(process.cwd(), "data");
const VAULT_PATH = join(VAULT_DIR, "vault.enc");
const AUTO_LOCK_MS = 30 * 60 * 1000; // 30 minutes
const MAX_UNLOCK_ATTEMPTS = 5;
const UNLOCK_LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes

class VaultService {
  private decryptedData: VaultData | null = null;
  private encryptionKey: Buffer | null = null;
  private salt: Buffer | null = null;
  private lockTimer: ReturnType<typeof setTimeout> | null = null;
  private failedUnlockAttempts = 0;
  private unlockLockedUntil: Date | null = null;

  private resetAutoLock(): void {
    if (this.lockTimer) clearTimeout(this.lockTimer);
    if (this.encryptionKey) {
      this.lockTimer = setTimeout(() => this.lock(), AUTO_LOCK_MS);
    }
  }

  private deriveKey(masterPassword: string, salt: Buffer): Buffer {
    return scryptSync(masterPassword, salt, 32, { N: 65536, r: 8, p: 1 });
  }

  private encrypt(data: VaultData): VaultFile {
    if (!this.encryptionKey || !this.salt) {
      throw new Error("Vault is locked");
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);

    const plaintext = JSON.stringify(data);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();

    return {
      salt: this.salt.toString("hex"),
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
      data: encrypted,
    };
  }

  private decrypt(vaultFile: VaultFile, key: Buffer): VaultData {
    const iv = Buffer.from(vaultFile.iv, "hex");
    const authTag = Buffer.from(vaultFile.authTag, "hex");

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(vaultFile.data, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted);
  }

  private persist(): void {
    if (!this.decryptedData) throw new Error("Vault is locked");

    if (!existsSync(VAULT_DIR)) {
      mkdirSync(VAULT_DIR, { recursive: true });
    }

    const vaultFile = this.encrypt(this.decryptedData);
    writeFileSync(VAULT_PATH, JSON.stringify(vaultFile), "utf8");
  }

  async unlock(masterPassword: string): Promise<boolean> {
    // Rate limiting on unlock attempts
    if (this.unlockLockedUntil && Date.now() < this.unlockLockedUntil.getTime()) {
      const remaining = Math.ceil((this.unlockLockedUntil.getTime() - Date.now()) / 1000 / 60);
      console.log(`[Vault] Unlock locked out for ${remaining} more minutes`);
      return false;
    }
    if (this.unlockLockedUntil && Date.now() >= this.unlockLockedUntil.getTime()) {
      this.unlockLockedUntil = null;
      this.failedUnlockAttempts = 0;
    }

    try {
      if (existsSync(VAULT_PATH)) {
        // Existing vault — decrypt with provided password
        const raw = readFileSync(VAULT_PATH, "utf8");
        const vaultFile: VaultFile = JSON.parse(raw);
        const salt = Buffer.from(vaultFile.salt, "hex");
        const key = this.deriveKey(masterPassword, salt);

        // decrypt will throw if password is wrong (auth tag mismatch)
        const data = this.decrypt(vaultFile, key);

        this.encryptionKey = key;
        this.salt = salt;
        this.decryptedData = data;
      } else {
        // First-time setup — create new vault with fresh salt
        const salt = randomBytes(32);
        const key = this.deriveKey(masterPassword, salt);

        this.encryptionKey = key;
        this.salt = salt;
        this.decryptedData = {};
        this.persist();
      }

      this.failedUnlockAttempts = 0;
      this.resetAutoLock();
      return true;
    } catch {
      // Wrong password or corrupted file
      this.encryptionKey = null;
      this.salt = null;
      this.decryptedData = null;
      this.failedUnlockAttempts++;
      if (this.failedUnlockAttempts >= MAX_UNLOCK_ATTEMPTS) {
        this.unlockLockedUntil = new Date(Date.now() + UNLOCK_LOCKOUT_MS);
        this.failedUnlockAttempts = 0;
        console.log("[Vault] Too many failed unlock attempts — locked out for 10 minutes");
      }
      return false;
    }
  }

  lock(): void {
    if (this.lockTimer) {
      clearTimeout(this.lockTimer);
      this.lockTimer = null;
    }
    if (this.encryptionKey) { this.encryptionKey.fill(0); }
    if (this.salt) { this.salt.fill(0); }
    this.encryptionKey = null;
    this.salt = null;
    this.decryptedData = null;
  }

  isLocked(): boolean {
    return this.decryptedData === null;
  }

  addCredential(site: string, username: string, password: string): void {
    if (!this.decryptedData) throw new Error("Vault is locked");

    this.decryptedData[site] = { username, password };
    this.persist();
    this.resetAutoLock();
  }

  getCredential(site: string): { username: string; password: string } | null {
    if (!this.decryptedData) throw new Error("Vault is locked");

    this.resetAutoLock();
    const cred = this.decryptedData[site];
    return cred ? { username: cred.username, password: cred.password } : null;
  }

  listSites(): string[] {
    if (!this.decryptedData) throw new Error("Vault is locked");

    this.resetAutoLock();
    return Object.keys(this.decryptedData);
  }

  deleteCredential(site: string): void {
    if (!this.decryptedData) throw new Error("Vault is locked");
    if (!(site in this.decryptedData)) throw new Error(`No credentials found for "${site}"`);

    delete this.decryptedData[site];
    this.persist();
    this.resetAutoLock();
  }
}

export const vault = new VaultService();
