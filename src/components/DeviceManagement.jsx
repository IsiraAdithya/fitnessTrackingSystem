// src/components/DeviceManagement.jsx - Production Device Management
import React, { useState, useEffect, useCallback } from "react";
import { useAuthContext } from "../contexts/AuthContext";
import {
  getAvailableDevices,
  checkDeviceStatus,
} from "../services/enrollmentService";
import { toast } from "react-hot-toast";

const DeviceManagement = () => {
  const { gymInfo } = useAuthContext();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [deviceDetails, setDeviceDetails] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch devices on component mount
  const fetchDevices = useCallback(
    async (showToast = false) => {
      if (!gymInfo?.id) return;

      try {
        setRefreshing(true);
        const deviceList = await getAvailableDevices(gymInfo.id);
        setDevices(deviceList);

        if (showToast) {
          toast.success(`Refreshed ${deviceList.length} devices`);
        }

        console.log(
          `📱 Loaded ${deviceList.length} devices for gym ${gymInfo.id}`
        );
      } catch (error) {
        console.error("❌ Error fetching devices:", error);
        toast.error("Failed to load devices");
        setDevices([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [gymInfo?.id]
  );

  // Get detailed device information
  const fetchDeviceDetails = async (deviceId) => {
    if (!gymInfo?.id) return;

    try {
      const status = await checkDeviceStatus(gymInfo.id, deviceId);
      setDeviceDetails(status);
    } catch (error) {
      console.error("❌ Error fetching device details:", error);
      toast.error("Failed to load device details");
    }
  };

  // Auto-refresh devices every 30 seconds
  useEffect(() => {
    fetchDevices();

    const interval = setInterval(() => {
      fetchDevices();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchDevices]);

  // Handle device selection
  const handleDeviceSelect = (deviceId) => {
    setSelectedDevice(deviceId);
    fetchDeviceDetails(deviceId);
  };

  // Get status color for device
  const getStatusColor = (device) => {
    if (!device.isOnline) return "text-red-600 bg-red-50";
    if (device.status === "online") return "text-green-600 bg-green-50";
    if (device.status === "busy") return "text-yellow-600 bg-yellow-50";
    return "text-gray-600 bg-gray-50";
  };

  // Get status icon
  const getStatusIcon = (device) => {
    if (!device.isOnline) return "🔴";
    if (device.status === "online") return "🟢";
    if (device.status === "busy") return "🟡";
    return "⚪";
  };

  // Format uptime
  const formatUptime = (seconds) => {
    if (!seconds) return "Unknown";

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  // Format last seen time
  const formatLastSeen = (lastSeen, timeDiff) => {
    if (!lastSeen) return "Never";

    if (timeDiff < 60) return "Just now";
    if (timeDiff < 3600) return `${Math.floor(timeDiff / 60)}m ago`;
    if (timeDiff < 86400) return `${Math.floor(timeDiff / 3600)}h ago`;
    return `${Math.floor(timeDiff / 86400)}d ago`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Device Management
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Monitor and manage fingerprint scanners and access devices
            </p>
          </div>
          <button
            onClick={() => fetchDevices(true)}
            disabled={refreshing}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      <div className="p-6">
        {devices.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">📱</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No Devices Found
            </h3>
            <p className="text-gray-600 mb-4">
              No ESP32 devices are currently registered with this gym.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left max-w-md mx-auto">
              <h4 className="font-medium text-blue-900 mb-2">
                To add a device:
              </h4>
              <ol className="text-sm text-blue-800 space-y-1">
                <li>1. Flash the ESP32 with the production firmware</li>
                <li>2. Configure WiFi and Firebase credentials</li>
                <li>3. Set the correct GYM_ID in the firmware</li>
                <li>4. Power on the device - it will auto-register</li>
              </ol>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Device List */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900 mb-3">
                Connected Devices ({devices.length})
              </h3>

              {devices.map((device) => (
                <div
                  key={device.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    selectedDevice === device.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => handleDeviceSelect(device.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <span className="text-xl">{getStatusIcon(device)}</span>
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {device.location}
                        </h4>
                        <p className="text-sm text-gray-600">{device.id}</p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                        device
                      )}`}
                    >
                      {device.isOnline ? device.status : "offline"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Last Seen:</span>
                      <p className="font-medium">
                        {formatLastSeen(device.lastSeen, device.timeDiff)}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Version:</span>
                      <p className="font-medium">{device.version}</p>
                    </div>
                  </div>

                  {device.capabilities && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {device.capabilities.enrollment && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          📝 Enrollment
                        </span>
                      )}
                      {device.capabilities.attendance && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          👆 Attendance
                        </span>
                      )}
                      {device.capabilities.audio && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          🔊 Audio
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Device Details */}
            <div className="bg-gray-50 rounded-lg p-4">
              {selectedDevice && deviceDetails ? (
                <div>
                  <h3 className="font-medium text-gray-900 mb-4">
                    Device Details
                  </h3>

                  <div className="space-y-4">
                    {/* Status Overview */}
                    <div className="bg-white rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-3">
                        Status Overview
                      </h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Availability:</span>
                          <p
                            className={`font-medium ${
                              deviceDetails.available
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {deviceDetails.available
                              ? "✅ Available"
                              : "❌ Unavailable"}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500">Reason:</span>
                          <p className="font-medium">{deviceDetails.reason}</p>
                        </div>
                      </div>
                    </div>

                    {/* Device Information */}
                    {deviceDetails.deviceInfo && (
                      <div className="bg-white rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-3">
                          Device Information
                        </h4>
                        <div className="space-y-3 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Location:</span>
                            <span className="font-medium">
                              {deviceDetails.deviceInfo.location}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">
                              Firmware Version:
                            </span>
                            <span className="font-medium">
                              {deviceDetails.deviceInfo.version}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Uptime:</span>
                            <span className="font-medium">
                              {formatUptime(deviceDetails.deviceInfo.uptime)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Capabilities */}
                    {deviceDetails.deviceInfo?.capabilities && (
                      <div className="bg-white rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-3">
                          Capabilities
                        </h4>
                        <div className="space-y-2">
                          {Object.entries(
                            deviceDetails.deviceInfo.capabilities
                          ).map(([capability, enabled]) => (
                            <div
                              key={capability}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-gray-600 capitalize">
                                {capability.replace("_", " ")}:
                              </span>
                              <span
                                className={`font-medium ${
                                  enabled ? "text-green-600" : "text-gray-400"
                                }`}
                              >
                                {enabled ? "✅ Enabled" : "❌ Disabled"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Quick Actions */}
                    <div className="bg-white rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-3">
                        Quick Actions
                      </h4>
                      <div className="grid grid-cols-1 gap-2">
                        <button
                          onClick={() => fetchDeviceDetails(selectedDevice)}
                          className="flex items-center justify-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                          <span>Refresh Status</span>
                        </button>

                        <button
                          onClick={() => {
                            const device = devices.find(
                              (d) => d.id === selectedDevice
                            );
                            if (device?.isOnline) {
                              toast.success(
                                `Test signal sent to ${device.location}`
                              );
                            } else {
                              toast.error(
                                "Device is offline - cannot send test signal"
                              );
                            }
                          }}
                          disabled={
                            !devices.find((d) => d.id === selectedDevice)
                              ?.isOnline
                          }
                          className="flex items-center justify-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                          </svg>
                          <span>Send Test Signal</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-4xl mb-4">📱</div>
                  <h3 className="font-medium text-gray-900 mb-2">
                    Select a Device
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Click on a device from the list to view detailed information
                    and management options.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* System Status Summary */}
        {devices.length > 0 && (
          <div className="mt-8 bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-4">
              System Status Summary
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-white rounded-lg p-3">
                <div className="text-2xl font-bold text-blue-600">
                  {devices.length}
                </div>
                <div className="text-sm text-gray-600">Total Devices</div>
              </div>
              <div className="bg-white rounded-lg p-3">
                <div className="text-2xl font-bold text-green-600">
                  {devices.filter((d) => d.isOnline).length}
                </div>
                <div className="text-sm text-gray-600">Online</div>
              </div>
              <div className="bg-white rounded-lg p-3">
                <div className="text-2xl font-bold text-red-600">
                  {devices.filter((d) => !d.isOnline).length}
                </div>
                <div className="text-sm text-gray-600">Offline</div>
              </div>
              <div className="bg-white rounded-lg p-3">
                <div className="text-2xl font-bold text-purple-600">
                  {devices.filter((d) => d.capabilities?.enrollment).length}
                </div>
                <div className="text-sm text-gray-600">Enrollment Ready</div>
              </div>
            </div>
          </div>
        )}

        {/* Help Section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-900 mb-2">
            💡 Device Management Tips
          </h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>
              • Devices automatically register when powered on with correct
              configuration
            </li>
            <li>
              • Green status means the device is online and ready for operations
            </li>
            <li>
              • Yellow status indicates the device is busy processing a request
            </li>
            <li>
              • Red status means the device is offline or has connectivity
              issues
            </li>
            <li>• Use "Send Test Signal" to verify device responsiveness</li>
            <li>• Check device logs via serial monitor for troubleshooting</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DeviceManagement;
