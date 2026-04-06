// Phase 5 — Permission Manager
// Level 1: Session-based topic permissions (grant/revoke)
// Level 2: PIN verification for vault/credential access (bcrypt, lockout)

import bcrypt from "bcrypt";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");
const PIN_FILE = join(DATA_DIR, "pin.hash");
const BCRYPT_ROUNDS = 12;
const PIN_VERIFY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const LOCKOUT_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PIN_ATTEMPTS = 3;

class PermissionManager {
  // Level 1: Topic-based session permissions
  private sessionPermissions = new Set<string>();

  // Level 2: PIN state
  private verifiedUntil: Date | null = null;
  private failedPinAttempts = 0;
  private lockedUntil: Date | null = null;
  private pinHash: string | null = null;

  constructor() {
    this.loadPinHash();
  }

  // ── Level 1: Session Permissions ─────────────────────────────

  grant(topic: string): void {
    this.sessionPermissions.add(topic.toLowerCase());
    console.log(`[PermissionManager] Granted: ${topic}`);
  }

  revoke(topic: string): void {
    this.sessionPermissions.delete(topic.toLowerCase());
    console.log(`[PermissionManager] Revoked: ${topic}`);
  }

  has(topic: string): boolean {
    return this.sessionPermissions.has(topic.toLowerCase());
  }

  listPermissions(): string[] {
    return Array.from(this.sessionPermissions);
  }

  clearAll(): void {
    this.sessionPermissions.clear();
    this.verifiedUntil = null;
    console.log("[PermissionManager] All permissions cleared");
  }

  // ── Level 2: PIN Verification ────────────────────────────────

  isPinSet(): boolean {
    return this.pinHash !== null;
  }

  async setPin(pin: string): Promise<void> {
    if (pin.length < 4 || pin.length > 8) {
      throw new Error("PIN must be 4-8 digits");
    }
    if (!/^\d+$/.test(pin)) {
      throw new Error("PIN must be numeric only");
    }

    this.pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);

    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(PIN_FILE, this.pinHash, "utf-8");
    console.log("[PermissionManager] PIN set successfully");
  }

  async verify(pin: string): Promise<"granted" | "denied" | "locked"> {
    // Check lockout
    if (this.isLocked()) {
      const remaining = Math.ceil(
        (this.lockedUntil!.getTime() - Date.now()) / 1000 / 60
      );
      console.log(`[PermissionManager] Locked for ${remaining} more minutes`);
      return "locked";
    }

    if (!this.pinHash) {
      return "denied";
    }

    const match = await bcrypt.compare(pin, this.pinHash);

    if (match) {
      this.failedPinAttempts = 0;
      this.verifiedUntil = new Date(Date.now() + PIN_VERIFY_WINDOW_MS);
      console.log("[PermissionManager] PIN verified, window open for 5 minutes");
      return "granted";
    }

    this.failedPinAttempts++;
    console.log(
      `[PermissionManager] PIN failed (${this.failedPinAttempts}/${MAX_PIN_ATTEMPTS})`
    );

    if (this.failedPinAttempts >= MAX_PIN_ATTEMPTS) {
      this.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      this.failedPinAttempts = 0;
      console.log("[PermissionManager] LOCKED OUT for 10 minutes");
      return "locked";
    }

    return "denied";
  }

  isVerified(): boolean {
    if (!this.verifiedUntil) return false;
    if (Date.now() > this.verifiedUntil.getTime()) {
      this.verifiedUntil = null;
      return false;
    }
    return true;
  }

  isLocked(): boolean {
    if (!this.lockedUntil) return false;
    if (Date.now() > this.lockedUntil.getTime()) {
      this.lockedUntil = null;
      return false;
    }
    return true;
  }

  autoLock(): void {
    this.verifiedUntil = null;
    console.log("[PermissionManager] PIN verification expired (auto-lock)");
  }

  getRemainingLockoutMinutes(): number {
    if (!this.lockedUntil) return 0;
    const remaining = (this.lockedUntil.getTime() - Date.now()) / 1000 / 60;
    return Math.max(0, Math.ceil(remaining));
  }

  // ── Private ──────────────────────────────────────────────────

  private loadPinHash(): void {
    if (!existsSync(PIN_FILE)) {
      console.log("[PermissionManager] No PIN configured yet");
      return;
    }
    try {
      this.pinHash = readFileSync(PIN_FILE, "utf-8").trim();
      console.log("[PermissionManager] PIN hash loaded");
    } catch (err) {
      console.error("[PermissionManager] CRITICAL: PIN file exists but cannot be read:", err);
      // Fail closed — leave pinHash null so isPinSet() returns false
      // but isVerified() also returns false, blocking vault access
    }
  }
}

// Singleton
export const permissionManager = new PermissionManager();
