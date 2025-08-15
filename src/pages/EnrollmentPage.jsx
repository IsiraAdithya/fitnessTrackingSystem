// src/pages/EnrollmentPage.jsx - Dedicated Enrollment Page
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/layout/Layout";
import toast from "react-hot-toast";
import {
  createMemberAndStartEnrollment,
  listenToEnrollmentStatus,
  cancelEnrollment,
  getAvailableDevices,
} from "../services/enrollmentService";
import { getMembershipTiers } from "../services/settingsService";

const EnrollmentPage = () => {
  const { gymInfo } = useAuth();
  const navigate = useNavigate();

  // Form state
  const [formData, setFormData] = useState({
    gymMemberId: "",
    Name: "",
    Age: "",
    Address: "",
    Phone_Number: "",
    Payment_Status: "Unpaid",
    membershipTierId: "",
  });

  // Enrollment state
  const [enrollmentState, setEnrollmentState] = useState("idle"); // idle, requesting, waiting, processing, success, failed
  const [enrollmentStatus, setEnrollmentStatus] = useState("");
  const [assignedFingerprintId, setAssignedFingerprintId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState("fingerprint_scanner_1");

  // Real-time listener
  const [unsubscribe, setUnsubscribe] = useState(null);
  const [membershipTiers, setMembershipTiers] = useState([]);

  // Load available devices on component mount
  useEffect(() => {
    if (gymInfo?.id) {
      fetchAvailableDevices();
    }
  }, [gymInfo]);

  useEffect(() => {
    if (gymInfo?.id) {
      fetchMembershipTiers();
    }
  }, [gymInfo]);
  // Add this useEffect after the existing ones
  useEffect(() => {
    if (enrollmentState === "success" && assignedFingerprintId) {
      console.log("✅ Enrollment successful, setting up auto-redirect");

      const redirectTimer = setTimeout(() => {
        console.log("🔄 Auto-redirecting to members page");
        navigate("/members", {
          state: {
            message: `Successfully enrolled ${formData.Name} with Fingerprint ID: ${assignedFingerprintId}`,
            type: "success",
          },
        });
      }, 3000);

      return () => clearTimeout(redirectTimer);
    }
  }, [enrollmentState, assignedFingerprintId, navigate, formData.Name]);
  // Cleanup listener on unmount
  useEffect(() => {
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [unsubscribe]);

  const fetchAvailableDevices = async () => {
    try {
      const deviceList = await getAvailableDevices(gymInfo.id);
      setDevices(deviceList);

      // Auto-select the first online device
      const onlineDevice = deviceList.find((d) => d.isOnline);
      if (onlineDevice) {
        setSelectedDevice(onlineDevice.id);
      }
    } catch (error) {
      console.error("Error fetching devices:", error);
      toast.error("Failed to load available devices");
    }
  };
  const fetchMembershipTiers = async () => {
    try {
      const tiers = await getMembershipTiers(gymInfo.id);
      setMembershipTiers(tiers);
    } catch (error) {
      console.error("Error fetching membership tiers:", error);
      toast.error("Failed to load membership tiers");
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.Name.trim()) {
      toast.error("Member name is required");
      return;
    }

    if (!gymInfo?.id) {
      toast.error("Gym information is not available");
      return;
    }

    // Check if selected device is online
    const device = devices.find((d) => d.id === selectedDevice);
    if (!device || !device.isOnline) {
      toast.error(
        "Selected device is offline. Please choose another device or check device status."
      );
      return;
    }

    try {
      setIsLoading(true);
      setEnrollmentState("requesting");
      setEnrollmentStatus("Initializing enrollment process...");

      console.log("🚀 Starting enrollment for:", formData.Name);
      console.log("📱 Using device:", selectedDevice);

      // Set up real-time listener first
      const listener = listenToEnrollmentStatus(
        gymInfo.id,
        selectedDevice,
        (statusUpdate) => {
          console.log("📡 Enrollment status update:", statusUpdate);

          switch (statusUpdate.status) {
            case "pending":
              setEnrollmentState("waiting");
              setEnrollmentStatus(
                "Enrollment request sent to device. Please follow device instructions."
              );
              break;
            case "in_progress":
              setEnrollmentState("processing");
              setEnrollmentStatus(
                "Fingerprint enrollment in progress. Place finger on sensor as instructed."
              );
              break;
            case "completed":
              setEnrollmentState("success");
              setAssignedFingerprintId(statusUpdate.fingerprintId);
              setEnrollmentStatus(
                `Enrollment successful! Fingerprint ID: ${statusUpdate.fingerprintId}`
              );
              break;
            case "failed":
              setEnrollmentState("failed");
              setEnrollmentStatus(`Enrollment failed: ${statusUpdate.message}`);
              break;
            case "cancelled":
              setEnrollmentState("failed");
              setEnrollmentStatus("Enrollment was cancelled");
              break;
            case "error":
              setEnrollmentState("failed");
              setEnrollmentStatus(`Connection error: ${statusUpdate.message}`);
              break;
            default:
              setEnrollmentStatus(statusUpdate.message || "Processing...");
          }
        }
      );
      setUnsubscribe(() => listener);

      // Start the enrollment process
      // In your handleSubmit function, find this part:
      const enrollmentResult = await createMemberAndStartEnrollment(
        gymInfo.id,
        formData,
        selectedDevice
      );

      // Add this check right after:
      if (enrollmentResult.success) {
        const { fingerprintId, message } = enrollmentResult;
        console.log(
          `✅ Member created successfully with Fingerprint ID: ${fingerprintId}Id`
        );

        // FORCE the success state (ADD THESE LINES)
        setAssignedFingerprintId(fingerprintId);
        setEnrollmentState("success");
        setEnrollmentStatus(
          message ||
            `Member enrolled successfully! Fingerprint ID: ${fingerprintId}`
        );

        toast.success(
          `🎉 ${formData.Name} enrolled with Fingerprint ID: ${fingerprintId}`,
          {
            duration: 5000,
            style: {
              background: "#10B981",
              color: "white",
            },
          }
        );

        // Auto-redirect after 3 seconds (THIS SHOULD WORK NOW)
        setTimeout(() => {
          navigate("/members", {
            state: {
              message: `Successfully enrolled ${formData.Name} with Fingerprint ID: ${fingerprintId}`,
              type: "success",
            },
          });
        }, 3000);
      } else {
        throw new Error(
          enrollmentResult.message || "Enrollment process failed."
        );
      }
    } catch (error) {
      console.error("❌ Enrollment failed:", error);
      setEnrollmentState("failed");
      const errorMessage = error.message || "An unknown error occurred.";
      setEnrollmentStatus(`Enrollment failed: ${errorMessage}`);
      toast.error(`Enrollment failed: ${errorMessage}`, { duration: 6000 });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async () => {
    if (
      enrollmentState === "requesting" ||
      enrollmentState === "waiting" ||
      enrollmentState === "processing"
    ) {
      try {
        await cancelEnrollment(gymInfo.id, selectedDevice);
        toast.success("Enrollment cancelled");
      } catch (error) {
        console.error("Cancel error:", error);
      }
    }

    // Navigate back to members page
    navigate("/members");
  };

  const handleRetry = () => {
    setEnrollmentState("idle");
    setEnrollmentStatus("");
    setAssignedFingerprintId(null);
    setIsLoading(false);
    if (unsubscribe) {
      unsubscribe();
      setUnsubscribe(null);
    }
  };

  const getStatusColor = () => {
    switch (enrollmentState) {
      case "requesting":
      case "waiting":
      case "processing":
        return "text-blue-600 bg-blue-50";
      case "success":
        return "text-green-600 bg-green-50";
      case "failed":
        return "text-red-600 bg-red-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const getStatusIcon = () => {
    switch (enrollmentState) {
      case "requesting":
      case "waiting":
      case "processing":
        return (
          <svg
            className="animate-spin h-6 w-6 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        );
      case "success":
        return (
          <svg
            className="h-6 w-6 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        );
      case "failed":
        return (
          <svg
            className="h-6 w-6 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        );
      default:
        return (
          <svg
            className="h-6 w-6 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        );
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Member Enrollment
              </h1>
              <p className="text-gray-600 mt-1">
                Add a new member and enroll their fingerprint
              </p>
            </div>
            <button
              onClick={handleCancel}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center space-x-2"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              <span>Back to Members</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <div className="lg:col-span-2">
            <div className="bg-white shadow-sm rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">
                Member Information
              </h2>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Gym Member ID */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gym Member ID (Optional)
                  </label>
                  <input
                    type="text"
                    name="gymMemberId"
                    value={formData.gymMemberId}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                    placeholder="e.g., GYM001, M123, etc."
                    disabled={isLoading}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This ID will be used by gym staff to identify the member.
                    Leave blank to auto-generate.
                  </p>
                </div>

                {/* Member Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Member Name *
                  </label>
                  <input
                    type="text"
                    name="Name"
                    value={formData.Name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                    placeholder="Enter member name"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Age */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Age
                    </label>
                    <input
                      type="number"
                      name="Age"
                      value={formData.Age}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                      placeholder="Enter age"
                      min="1"
                      max="120"
                      disabled={isLoading}
                    />
                  </div>

                  {/* Payment Status */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Payment Status
                    </label>
                    <select
                      name="Payment_Status"
                      value={formData.Payment_Status}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                      disabled={isLoading}
                    >
                      <option value="Paid">Paid</option>
                      <option value="Unpaid">Unpaid</option>
                    </select>
                  </div>
                </div>

                {/* Phone Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    name="Phone_Number"
                    value={formData.Phone_Number}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                    placeholder="Enter phone number"
                    disabled={isLoading}
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address
                  </label>
                  <textarea
                    name="Address"
                    value={formData.Address}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors resize-none"
                    placeholder="Enter address"
                    rows="3"
                    disabled={isLoading}
                  />
                </div>

                {/* Device Selection */}
                {/* Membership Tier Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Membership Tier
                  </label>
                  <select
                    name="membershipTierId"
                    value={formData.membershipTierId}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                    disabled={isLoading}
                  >
                    <option value="">Select membership tier (optional)</option>
                    {membershipTiers.map((tier) => (
                      <option key={tier.id} value={tier.id}>
                        {tier.name} - LKR {tier.price}/month
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Select a membership tier to set the monthly fee for this
                    member.
                  </p>
                </div>

                {/* Device Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fingerprint Scanner Device
                  </label>
                  <select
                    value={selectedDevice}
                    onChange={(e) => setSelectedDevice(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                    disabled={isLoading}
                  >
                    {devices.map((device) => (
                      <option
                        key={device.id}
                        value={device.id}
                        disabled={!device.isOnline}
                      >
                        {device.location} -{" "}
                        {device.isOnline ? "Online" : "Offline"} ({device.id})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Select the fingerprint scanner device to use for enrollment.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-4 pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="flex-1 px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-gray-200 transition-all duration-200 font-medium"
                    disabled={isLoading}
                  >
                    Cancel
                  </button>

                  {enrollmentState === "failed" && (
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200 font-medium"
                    >
                      Try Again
                    </button>
                  )}

                  {enrollmentState !== "success" && (
                    <button
                      type="submit"
                      className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-lg hover:shadow-xl"
                      disabled={
                        isLoading ||
                        !formData.Name.trim() ||
                        enrollmentState === "processing"
                      }
                    >
                      <div className="flex items-center justify-center space-x-2">
                        {isLoading && (
                          <svg
                            className="animate-spin h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                        )}
                        <span>
                          {isLoading
                            ? "Starting Enrollment..."
                            : "Start Enrollment"}
                        </span>
                      </div>
                    </button>
                  )}

                  {enrollmentState === "success" && (
                    <button
                      type="button"
                      onClick={() => navigate("/members")}
                      className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200 font-medium"
                    >
                      Go to Members
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* Status Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white shadow-sm rounded-lg p-6 sticky top-6">
              <div className="flex items-center space-x-3 mb-4">
                {getStatusIcon()}
                <h3 className="text-lg font-semibold text-gray-900">
                  Enrollment Status
                </h3>
              </div>

              {/* Status Display */}
              {enrollmentState !== "idle" && (
                <div
                  className={`p-4 rounded-lg border ${getStatusColor()} mb-4`}
                >
                  <p className="text-sm font-medium mb-2">
                    Current Status:{" "}
                    {enrollmentState.charAt(0).toUpperCase() +
                      enrollmentState.slice(1)}
                  </p>
                  <p className="text-sm">{enrollmentStatus}</p>
                  {assignedFingerprintId && (
                    <div className="mt-3 p-3 bg-green-100 rounded-lg border border-green-200">
                      <div className="flex items-center space-x-2">
                        <svg
                          className="h-4 w-4 text-green-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        <p className="text-sm font-semibold text-green-800">
                          Fingerprint ID: {assignedFingerprintId}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Instructions */}
              {enrollmentState === "idle" && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <h4 className="font-medium text-blue-800 mb-3 flex items-center">
                    <svg
                      className="h-5 w-5 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Enrollment Process
                  </h4>
                  <ol className="text-sm text-blue-700 space-y-2">
                    <li className="flex items-start">
                      <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">
                        1
                      </span>
                      Fill in member details
                    </li>
                    <li className="flex items-start">
                      <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">
                        2
                      </span>
                      Select an online device
                    </li>
                    <li className="flex items-start">
                      <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">
                        3
                      </span>
                      Click "Start Enrollment"
                    </li>
                    <li className="flex items-start">
                      <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">
                        4
                      </span>
                      Follow device instructions
                    </li>
                    <li className="flex items-start">
                      <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">
                        5
                      </span>
                      Member will be created automatically
                    </li>
                  </ol>
                </div>
              )}

              {/* Device Status */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-800 mb-3">
                  Available Devices
                </h4>
                <div className="space-y-2">
                  {devices.length === 0 ? (
                    <p className="text-sm text-gray-600">Loading devices...</p>
                  ) : (
                    devices.map((device) => (
                      <div
                        key={device.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-gray-700">{device.location}</span>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            device.isOnline
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {device.isOnline ? "Online" : "Offline"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <button
                  onClick={fetchAvailableDevices}
                  className="mt-3 w-full text-sm text-blue-600 hover:text-blue-800 font-medium"
                  disabled={isLoading}
                >
                  Refresh Device Status
                </button>
              </div>

              {/* Auto-redirect notification */}
              {enrollmentState === "success" && (
                <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm text-green-800">
                    ✅ Enrollment completed! Redirecting to Members page in 3
                    seconds...
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default EnrollmentPage;
