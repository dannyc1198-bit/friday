// Vault Management Tools for JARVIS — Credential Vault
// Secure credential storage with PIN verification for sensitive operations
// Tools: vault_unlock, vault_lock, vault_status, vault_add, vault_get, vault_list, vault_delete

import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";
import { vault } from "../services/vault.js";
import { permissionManager } from "../services/permission-manager.js";

// ─── Tool Definitions ────────────────────────────────────────

const vaultUnlockTool: Tool = {
  name: "vault_unlock",
  description:
    "Unlock the credential vault with the master password. Must be unlocked before accessing credentials.",
  category: "Security",
  parameters: [
    {
      name: "master_password",
      type: "string",
      description: "The master password to unlock the vault",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    try {
      const success = await vault.unlock(params.master_password as string);
      if (success) {
        return {
          toolCallId: "",
          success: true,
          data: { message: "Vault unlocked successfully, sir." },
        };
      }
      return {
        toolCallId: "",
        success: false,
        error: "Invalid master password. Vault remains locked.",
      };
    } catch (err: any) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to unlock vault: ${err.message}`,
      };
    }
  },
};

const vaultLockTool: Tool = {
  name: "vault_lock",
  description: "Lock the credential vault immediately. All access is revoked until unlocked again.",
  category: "Security",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    try {
      vault.lock();
      return {
        toolCallId: "",
        success: true,
        data: { message: "Vault locked. Credentials are secure." },
      };
    } catch (err: any) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to lock vault: ${err.message}`,
      };
    }
  },
};

const vaultStatusTool: Tool = {
  name: "vault_status",
  description:
    "Check whether the credential vault is locked or unlocked, and how many credentials are stored.",
  category: "Security",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    try {
      const locked = vault.isLocked();
      const sites = locked ? [] : vault.listSites();
      return {
        toolCallId: "",
        success: true,
        data: {
          message: locked
            ? "Vault is locked."
            : `Vault is unlocked. ${sites.length} credential(s) stored.`,
          locked,
          credentialCount: locked ? undefined : sites.length,
        },
      };
    } catch (err: any) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to check vault status: ${err.message}`,
      };
    }
  },
};

const vaultAddTool: Tool = {
  name: "vault_add",
  description:
    "Add credentials for a site to the vault. Requires PIN verification.",
  category: "Security",
  parameters: [
    {
      name: "site",
      type: "string",
      description: "The site or service name (e.g., 'github', 'gmail')",
      required: true,
    },
    {
      name: "username",
      type: "string",
      description: "The username or email for this credential",
      required: true,
    },
    {
      name: "password",
      type: "string",
      description: "The password for this credential",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    if (!permissionManager.isVerified()) {
      return {
        toolCallId: "",
        success: false,
        error: "PIN verification required before adding credentials.",
      };
    }

    if (vault.isLocked()) {
      return {
        toolCallId: "",
        success: false,
        error: "Vault is locked. Unlock it first with vault_unlock.",
      };
    }

    try {
      vault.addCredential(
        params.site as string,
        params.username as string,
        params.password as string
      );
      return {
        toolCallId: "",
        success: true,
        data: {
          message: `Credentials for "${params.site}" stored securely.`,
        },
      };
    } catch (err: any) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to add credential: ${err.message}`,
      };
    }
  },
};

const vaultGetTool: Tool = {
  name: "vault_get",
  description:
    "Retrieve credentials for a site. Requires PIN verification. Returns structured data — never includes the password in the message text.",
  category: "Security",
  parameters: [
    {
      name: "site",
      type: "string",
      description: "The site or service name to look up",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    if (!permissionManager.isVerified()) {
      return {
        toolCallId: "",
        success: false,
        error: "PIN verification required before retrieving credentials.",
      };
    }

    if (vault.isLocked()) {
      return {
        toolCallId: "",
        success: false,
        error: "Vault is locked. Unlock it first with vault_unlock.",
      };
    }

    try {
      const site = params.site as string;
      const credential = vault.getCredential(site);
      if (!credential) {
        return {
          toolCallId: "",
          success: false,
          error: `No credentials found for "${site}".`,
        };
      }
      return {
        toolCallId: "",
        success: true,
        data: {
          message: `Retrieved credentials for ${site}.`,
          credential: {
            site,
            username: credential.username,
            password: credential.password,
          },
        },
      };
    } catch (err: any) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to retrieve credential: ${err.message}`,
      };
    }
  },
};

const vaultListTool: Tool = {
  name: "vault_list",
  description:
    "List all site names stored in the vault. Returns only names, never passwords.",
  category: "Security",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    if (!permissionManager.isVerified()) {
      return {
        toolCallId: "",
        success: false,
        error: "PIN verification required to list stored sites.",
      };
    }

    if (vault.isLocked()) {
      return {
        toolCallId: "",
        success: false,
        error: "Vault is locked. Unlock it first with vault_unlock.",
      };
    }

    try {
      const sites = vault.listSites();
      return {
        toolCallId: "",
        success: true,
        data: {
          message:
            sites.length > 0
              ? `${sites.length} site(s) stored: ${sites.join(", ")}`
              : "No credentials stored in the vault.",
          sites,
          count: sites.length,
        },
      };
    } catch (err: any) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to list sites: ${err.message}`,
      };
    }
  },
};

const vaultDeleteTool: Tool = {
  name: "vault_delete",
  description:
    "Delete credentials for a site from the vault. Requires PIN verification.",
  category: "Security",
  parameters: [
    {
      name: "site",
      type: "string",
      description: "The site or service name to delete credentials for",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    if (!permissionManager.isVerified()) {
      return {
        toolCallId: "",
        success: false,
        error: "PIN verification required before deleting credentials.",
      };
    }

    if (vault.isLocked()) {
      return {
        toolCallId: "",
        success: false,
        error: "Vault is locked. Unlock it first with vault_unlock.",
      };
    }

    try {
      const site = params.site as string;
      vault.deleteCredential(site);
      return {
        toolCallId: "",
        success: true,
        data: {
          message: `Credentials for "${site}" removed from the vault.`,
        },
      };
    } catch (err: any) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to delete credential: ${err.message}`,
      };
    }
  },
};

// ─── Registration ────────────────────────────────────────────

export function registerVaultTools(): void {
  toolRegistry.register(vaultUnlockTool);
  toolRegistry.register(vaultLockTool);
  toolRegistry.register(vaultStatusTool);
  toolRegistry.register(vaultAddTool);
  toolRegistry.register(vaultGetTool);
  toolRegistry.register(vaultListTool);
  toolRegistry.register(vaultDeleteTool);
}
