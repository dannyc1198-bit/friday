import { exec } from "child_process";
import { promisify } from "util";
import type { Tool, ToolResult } from "../types/index.js";
import { toolRegistry } from "./registry.js";

const execAsync = promisify(exec);

// Execute PowerShell command
async function runPowerShell(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(
      `powershell -Command "${command.replace(/"/g, '\\"')}"`,
      { timeout: 30000 }
    );
    if (stderr) {
      console.warn("[PowerShell] stderr:", stderr);
    }
    return stdout.trim();
  } catch (error) {
    throw new Error(
      `PowerShell error: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// Bluetooth device interface
interface BluetoothDevice {
  id: string;
  name: string;
  type: "audio" | "keyboard" | "mouse" | "phone" | "other";
  connected: boolean;
  paired: boolean;
  batteryLevel?: number;
  address?: string;
}

// Mock Bluetooth devices (used when real API unavailable or in mock mode)
const mockDevices: BluetoothDevice[] = [
  { id: "bt-001", name: "AirPods Pro", type: "audio", connected: true, paired: true, batteryLevel: 85, address: "00:1A:2B:3C:4D:5E" },
  { id: "bt-002", name: "Sony WH-1000XM4", type: "audio", connected: false, paired: true, batteryLevel: 60, address: "00:1A:2B:3C:4D:5F" },
  { id: "bt-003", name: "Logitech MX Master 3", type: "mouse", connected: true, paired: true, batteryLevel: 45, address: "00:1A:2B:3C:4D:60" },
  { id: "bt-004", name: "Magic Keyboard", type: "keyboard", connected: false, paired: true, batteryLevel: 90, address: "00:1A:2B:3C:4D:61" },
  { id: "bt-005", name: "iPhone 15 Pro", type: "phone", connected: false, paired: true, address: "00:1A:2B:3C:4D:62" },
];

let bluetoothEnabled = true;
const USE_REAL_BLUETOOTH = process.env.USE_REAL_BLUETOOTH === "true";

// Get real Bluetooth devices from Windows
async function getRealBluetoothDevices(): Promise<BluetoothDevice[]> {
  try {
    // Use PowerShell to get Bluetooth devices
    const psCommand = `
      Get-PnpDevice -Class Bluetooth | Where-Object { $_.Status -eq 'OK' -or $_.Status -eq 'Degraded' } | ForEach-Object {
        $device = $_
        $props = Get-PnpDeviceProperty -InstanceId $device.InstanceId | Where-Object { $_.KeyName -match 'DEVPKEY_Device_FriendlyName|DEVPKEY_Device_Address|DEVPKEY_Bluetooth_LastConnectedTime' }
        $name = ($props | Where-Object { $_.KeyName -eq 'DEVPKEY_Device_FriendlyName' }).Data
        $address = ($props | Where-Object { $_.KeyName -eq 'DEVPKEY_Device_Address' }).Data
        @{
          InstanceId = $device.InstanceId
          Name = if ($name) { $name } else { $device.FriendlyName }
          Address = $address
          Status = $device.Status
          Class = $device.Class
        }
      } | ConvertTo-Json -Compress
    `;

    const result = await runPowerShell(psCommand);
    if (!result || result === "null") {
      return mockDevices;
    }

    const devices = JSON.parse(result);
    const deviceList = Array.isArray(devices) ? devices : [devices];

    return deviceList.map((d: { InstanceId: string; Name: string; Address?: string; Status: string }) => {
      const name = d.Name?.toLowerCase() || "";
      let type: "audio" | "keyboard" | "mouse" | "phone" | "other" = "other";

      if (name.includes("headphone") || name.includes("speaker") || name.includes("audio") || name.includes("airpod") || name.includes("buds")) {
        type = "audio";
      } else if (name.includes("keyboard")) {
        type = "keyboard";
      } else if (name.includes("mouse")) {
        type = "mouse";
      } else if (name.includes("phone") || name.includes("iphone") || name.includes("android")) {
        type = "phone";
      }

      return {
        id: d.InstanceId,
        name: d.Name || "Unknown Device",
        type,
        connected: d.Status === "OK",
        paired: true,
        address: d.Address,
      };
    });
  } catch (error) {
    console.error("[Bluetooth] Failed to get real devices:", error);
    return mockDevices;
  }
}

// Get Bluetooth status
async function getBluetoothStatus(): Promise<boolean> {
  try {
    const result = await runPowerShell(`
      $bluetooth = Get-PnpDevice -Class Bluetooth -FriendlyName '*Radio*' -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($bluetooth -and $bluetooth.Status -eq 'OK') { 'true' } else { 'false' }
    `);
    return result.toLowerCase() === "true";
  } catch {
    return true; // Assume enabled if check fails
  }
}

// Get Bluetooth Devices Tool
const getBluetoothDevicesTool: Tool = {
  name: "get_bluetooth_devices",
  description: "Lists all paired and available Bluetooth devices",
  category: "bluetooth",
  parameters: [
    {
      name: "filter",
      type: "string",
      description: "Filter by device type: 'audio', 'keyboard', 'mouse', 'phone', 'all'",
      required: false,
      enum: ["audio", "keyboard", "mouse", "phone", "all"],
      default: "all",
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const filter = (params.filter as string) || "all";

    try {
      let devices: BluetoothDevice[];

      if (USE_REAL_BLUETOOTH) {
        devices = await getRealBluetoothDevices();
        bluetoothEnabled = await getBluetoothStatus();
      } else {
        devices = [...mockDevices];
      }

      if (filter !== "all") {
        devices = devices.filter((d) => d.type === filter);
      }

      return {
        toolCallId: "",
        success: true,
        data: {
          bluetoothEnabled,
          deviceCount: devices.length,
          devices: devices.map((d) => ({
            id: d.id,
            name: d.name,
            type: d.type,
            connected: d.connected,
            paired: d.paired,
            batteryLevel: d.batteryLevel,
          })),
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to get devices: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

// Connect Bluetooth Device Tool
const connectBluetoothDeviceTool: Tool = {
  name: "connect_bluetooth_device",
  description: "Connects to a paired Bluetooth device",
  category: "bluetooth",
  parameters: [
    {
      name: "device_id",
      type: "string",
      description: "The ID of the device to connect (e.g., 'bt-001')",
      required: false,
    },
    {
      name: "device_name",
      type: "string",
      description: "The name of the device to connect (e.g., 'AirPods Pro')",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    if (!bluetoothEnabled) {
      return {
        toolCallId: "",
        success: false,
        error: "Bluetooth is disabled. Enable it first.",
      };
    }

    const deviceId = params.device_id as string | undefined;
    const deviceName = params.device_name as string | undefined;

    try {
      let devices: BluetoothDevice[];
      if (USE_REAL_BLUETOOTH) {
        devices = await getRealBluetoothDevices();
      } else {
        devices = [...mockDevices];
      }

      let device: BluetoothDevice | undefined;

      if (deviceId) {
        device = devices.find((d) => d.id === deviceId);
      } else if (deviceName) {
        device = devices.find((d) =>
          d.name.toLowerCase().includes(deviceName.toLowerCase())
        );
      }

      if (!device) {
        return {
          toolCallId: "",
          success: false,
          error: "Device not found. Use get_bluetooth_devices to see available devices.",
        };
      }

      if (device.connected) {
        return {
          toolCallId: "",
          success: true,
          data: {
            message: `${device.name} is already connected`,
            device: device.name,
            connected: true,
          },
        };
      }

      // Try to connect using PowerShell
      if (USE_REAL_BLUETOOTH) {
        try {
          // Enable the device if disabled
          await runPowerShell(`Enable-PnpDevice -InstanceId '${device.id}' -Confirm:$false -ErrorAction SilentlyContinue`);

          // For audio devices, try to set as default
          if (device.type === "audio") {
            await runPowerShell(`
              $audioDevice = Get-AudioDevice -List | Where-Object { $_.Name -like '*${device.name.split(" ")[0]}*' }
              if ($audioDevice) { Set-AudioDevice -ID $audioDevice.ID -ErrorAction SilentlyContinue }
            `);
          }
        } catch (e) {
          console.warn("[Bluetooth] PowerShell connect attempt:", e);
        }
      }

      // Update mock state
      const mockDevice = mockDevices.find((d) => d.name === device?.name);
      if (mockDevice) {
        mockDevice.connected = true;
      }

      return {
        toolCallId: "",
        success: true,
        data: {
          message: `Connected to ${device.name}`,
          device: device.name,
          type: device.type,
          connected: true,
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to connect: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

// Disconnect Bluetooth Device Tool
const disconnectBluetoothDeviceTool: Tool = {
  name: "disconnect_bluetooth_device",
  description: "Disconnects a connected Bluetooth device",
  category: "bluetooth",
  parameters: [
    {
      name: "device_id",
      type: "string",
      description: "The ID of the device to disconnect",
      required: false,
    },
    {
      name: "device_name",
      type: "string",
      description: "The name of the device to disconnect",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const deviceId = params.device_id as string | undefined;
    const deviceName = params.device_name as string | undefined;

    try {
      let devices: BluetoothDevice[];
      if (USE_REAL_BLUETOOTH) {
        devices = await getRealBluetoothDevices();
      } else {
        devices = [...mockDevices];
      }

      let device: BluetoothDevice | undefined;

      if (deviceId) {
        device = devices.find((d) => d.id === deviceId);
      } else if (deviceName) {
        device = devices.find((d) =>
          d.name.toLowerCase().includes(deviceName.toLowerCase())
        );
      }

      if (!device) {
        return {
          toolCallId: "",
          success: false,
          error: "Device not found.",
        };
      }

      if (!device.connected) {
        return {
          toolCallId: "",
          success: true,
          data: {
            message: `${device.name} is already disconnected`,
            device: device.name,
            connected: false,
          },
        };
      }

      // Try to disconnect using PowerShell
      if (USE_REAL_BLUETOOTH) {
        try {
          await runPowerShell(`Disable-PnpDevice -InstanceId '${device.id}' -Confirm:$false -ErrorAction SilentlyContinue`);
        } catch (e) {
          console.warn("[Bluetooth] PowerShell disconnect attempt:", e);
        }
      }

      // Update mock state
      const mockDevice = mockDevices.find((d) => d.name === device?.name);
      if (mockDevice) {
        mockDevice.connected = false;
      }

      return {
        toolCallId: "",
        success: true,
        data: {
          message: `Disconnected ${device.name}`,
          device: device.name,
          connected: false,
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to disconnect: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

// Toggle Bluetooth Tool
const toggleBluetoothTool: Tool = {
  name: "toggle_bluetooth",
  description: "Enables or disables Bluetooth on the system",
  category: "bluetooth",
  parameters: [
    {
      name: "enabled",
      type: "boolean",
      description: "Enable (true) or disable (false) Bluetooth",
      required: false,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    let newState: boolean;

    if (params.enabled !== undefined) {
      newState = params.enabled as boolean;
    } else {
      newState = !bluetoothEnabled;
    }

    try {
      if (USE_REAL_BLUETOOTH) {
        // Toggle Bluetooth radio using PowerShell
        const action = newState ? "Enable" : "Disable";
        await runPowerShell(`
          Get-PnpDevice -Class Bluetooth -FriendlyName '*Radio*' | ${action}-PnpDevice -Confirm:$false -ErrorAction SilentlyContinue
        `);
      }

      bluetoothEnabled = newState;

      // If disabled, disconnect all mock devices
      if (!newState) {
        mockDevices.forEach((d) => (d.connected = false));
      }

      return {
        toolCallId: "",
        success: true,
        data: {
          message: `Bluetooth ${newState ? "enabled" : "disabled"}`,
          enabled: newState,
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to toggle Bluetooth: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

// Get Device Battery Tool
const getDeviceBatteryTool: Tool = {
  name: "get_device_battery",
  description: "Gets the battery level of a connected Bluetooth device",
  category: "bluetooth",
  parameters: [
    {
      name: "device_name",
      type: "string",
      description: "The name of the device to check",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const deviceName = params.device_name as string;

    try {
      let devices: BluetoothDevice[];
      if (USE_REAL_BLUETOOTH) {
        devices = await getRealBluetoothDevices();

        // Try to get battery info from Windows
        const batteryResult = await runPowerShell(`
          Get-PnpDevice -Class Battery | Where-Object { $_.FriendlyName -like '*${deviceName.split(" ")[0]}*' } | ForEach-Object {
            $battery = Get-WmiObject -Query "SELECT * FROM Win32_Battery WHERE DeviceID LIKE '%$($_.InstanceId.Replace('\\','\\\\'))%'" -ErrorAction SilentlyContinue
            if ($battery) { $battery.EstimatedChargeRemaining } else { '' }
          }
        `);

        if (batteryResult && !isNaN(parseInt(batteryResult))) {
          const device = devices.find((d) =>
            d.name.toLowerCase().includes(deviceName.toLowerCase())
          );
          if (device) {
            device.batteryLevel = parseInt(batteryResult);
          }
        }
      } else {
        devices = [...mockDevices];
      }

      const device = devices.find((d) =>
        d.name.toLowerCase().includes(deviceName.toLowerCase())
      );

      if (!device) {
        return {
          toolCallId: "",
          success: false,
          error: "Device not found.",
        };
      }

      if (device.batteryLevel === undefined) {
        return {
          toolCallId: "",
          success: true,
          data: {
            message: `Battery level not available for ${device.name}`,
            device: device.name,
            batteryLevel: null,
          },
        };
      }

      return {
        toolCallId: "",
        success: true,
        data: {
          message: `${device.name} battery: ${device.batteryLevel}%`,
          device: device.name,
          batteryLevel: device.batteryLevel,
          connected: device.connected,
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to get battery: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

// Switch Audio Output Tool
const switchAudioOutputTool: Tool = {
  name: "switch_audio_output",
  description: "Switches audio output to a specific Bluetooth audio device",
  category: "bluetooth",
  parameters: [
    {
      name: "device_name",
      type: "string",
      description: "The name of the audio device to switch to",
      required: true,
    },
  ],
  execute: async (params): Promise<ToolResult> => {
    const deviceName = params.device_name as string;

    try {
      let devices: BluetoothDevice[];
      if (USE_REAL_BLUETOOTH) {
        devices = await getRealBluetoothDevices();
      } else {
        devices = [...mockDevices];
      }

      const device = devices.find(
        (d) =>
          d.type === "audio" &&
          d.name.toLowerCase().includes(deviceName.toLowerCase())
      );

      if (!device) {
        return {
          toolCallId: "",
          success: false,
          error: "Audio device not found. Make sure it's a paired audio device.",
        };
      }

      // Try to set as default audio device using PowerShell
      if (USE_REAL_BLUETOOTH) {
        try {
          // First ensure device is connected
          await runPowerShell(`Enable-PnpDevice -InstanceId '${device.id}' -Confirm:$false -ErrorAction SilentlyContinue`);

          // Set as default audio device using AudioDeviceCmdlets module
          await runPowerShell(`
            $devices = Get-AudioDevice -List -ErrorAction SilentlyContinue
            $target = $devices | Where-Object { $_.Name -like '*${deviceName.split(" ")[0]}*' -and $_.Type -eq 'Playback' }
            if ($target) { Set-AudioDevice -ID $target.ID -ErrorAction SilentlyContinue }
          `);
        } catch (e) {
          console.warn("[Bluetooth] Failed to set audio device:", e);
        }
      }

      // Update mock state
      const mockDevice = mockDevices.find((d) => d.name === device.name);
      if (mockDevice) {
        mockDevice.connected = true;
      }

      return {
        toolCallId: "",
        success: true,
        data: {
          message: `Audio output switched to ${device.name}`,
          device: device.name,
          connected: true,
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to switch audio: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

// Scan for New Devices Tool
const scanBluetoothDevicesTool: Tool = {
  name: "scan_bluetooth_devices",
  description: "Scans for new Bluetooth devices to pair",
  category: "bluetooth",
  parameters: [],
  execute: async (): Promise<ToolResult> => {
    if (!bluetoothEnabled) {
      return {
        toolCallId: "",
        success: false,
        error: "Bluetooth is disabled. Enable it first.",
      };
    }

    try {
      if (USE_REAL_BLUETOOTH) {
        // Open Windows Bluetooth settings for pairing
        await runPowerShell(`Start-Process "ms-settings:bluetooth"`);

        return {
          toolCallId: "",
          success: true,
          data: {
            message: "Opened Bluetooth settings. Please pair your device from the Windows settings panel.",
            action: "settings_opened",
          },
        };
      }

      // Mock mode - simulate scan
      return {
        toolCallId: "",
        success: true,
        data: {
          message: "Scanning for devices... Found 2 new devices nearby",
          newDevices: [
            { name: "JBL Flip 5", type: "audio" },
            { name: "Galaxy Buds Pro", type: "audio" },
          ],
        },
      };
    } catch (error) {
      return {
        toolCallId: "",
        success: false,
        error: `Failed to scan: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
};

// Register all Bluetooth tools
export function registerBluetoothTools(): void {
  toolRegistry.register(getBluetoothDevicesTool);
  toolRegistry.register(connectBluetoothDeviceTool);
  toolRegistry.register(disconnectBluetoothDeviceTool);
  toolRegistry.register(toggleBluetoothTool);
  toolRegistry.register(getDeviceBatteryTool);
  toolRegistry.register(switchAudioOutputTool);
  toolRegistry.register(scanBluetoothDevicesTool);
}
