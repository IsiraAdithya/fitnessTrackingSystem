// src/components/members/NewMemberModal.jsx - PORTAL VERSION
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";
import {
  createMemberAndStartEnrollment,
  listenToEnrollmentStatus,
  cancelEnrollment,
} from "../../services/enrollmentService";
import { getMembershipTiers } from "../../services/settingsService";

const NewMemberModal = ({ isOpen, onClose, onMemberAdded }) => {
  const { gymInfo } = useAuth();

  // Form state
  const [formData, setFormData] = useState({
    gymMemberId: "", // Added gym member ID field
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

  // Real-time listener
  const [unsubscribe, setUnsubscribe] = useState(null);
  const [membershipTiers, setMembershipTiers] = useState([]);

  // Portal container
  const [portalContainer, setPortalContainer] = useState(null);

  // Create portal container
  useEffect(() => {
    let container = document.getElementById("modal-portal");
    if (!container) {
      container = document.createElement("div");
      container.id = "modal-portal";
      container.style.position = "fixed";
      container.style.top = "0";
      container.style.left = "0";
      container.style.width = "100%";
      container.style.height = "100%";
      container.style.zIndex = "9999";
      container.style.pointerEvents = "none";
      document.body.appendChild(container);
    }
    setPortalContainer(container);

    return () => {
      // Clean up portal container when component unmounts
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
    };
  }, []);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      resetForm();
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    } else {
      // Restore body scroll when modal closes
      document.body.style.overflow = "unset";
      // Cleanup listener when modal closes
      if (unsubscribe) {
        unsubscribe();
        setUnsubscribe(null);
      }
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen, unsubscribe]);

  const resetForm = () => {
    setFormData({
      gymMemberId: "",
      Name: "",
      Age: "",
      Address: "",
      Phone_Number: "",
      Payment_Status: "Unpaid",
      membershipTierId: "",
    });
    setEnrollmentState("idle");
    setEnrollmentStatus("");
    setAssignedFingerprintId(null);
    setIsLoading(false);
  };
  // ADD THIS useEffect:
  useEffect(() => {
    if (isOpen && gymInfo?.id) {
      fetchMembershipTiers();
    }
  }, [isOpen, gymInfo]);

  // ADD THIS function:
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

  // REPLACE the old handleSubmit function with this one:
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

    try {
      setIsLoading(true);
      setEnrollmentState("requesting");
      setEnrollmentStatus(
        "Starting enrollment... Please follow device instructions."
      );

      console.log("🚀 Starting enrollment for:", formData.Name);

      // A single call now handles the entire process
      const enrollmentResult = await createMemberAndStartEnrollment(
        gymInfo.id,
        formData
      );

      if (enrollmentResult.success) {
        const { fingerprintId } = enrollmentResult;
        console.log(
          `✅ Member created successfully with Fingerprint ID: ${fingerprintId}`
        );

        setAssignedFingerprintId(fingerprintId);
        setEnrollmentState("success");
        setEnrollmentStatus(
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

        if (onMemberAdded) {
          onMemberAdded();
        }

        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        // This case handles non-error failures from the service function
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
    if (enrollmentState === "requesting" || enrollmentState === "waiting") {
      try {
        await cancelEnrollment(gymInfo.id);
        toast.success("Enrollment cancelled");
      } catch (error) {
        console.error("Cancel error:", error);
      }
    }
    onClose();
  };

  const getStatusColor = () => {
    switch (enrollmentState) {
      case "requesting":
      case "waiting":
      case "processing":
        return "text-blue-600";
      case "success":
        return "text-green-600";
      case "failed":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const getStatusIcon = () => {
    switch (enrollmentState) {
      case "requesting":
      case "waiting":
      case "processing":
        return (
          <svg
            className="animate-spin h-5 w-5 text-blue-600"
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
            className="h-5 w-5 text-green-600"
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
            className="h-5 w-5 text-red-600"
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
        return null;
    }
  };

  // Don't render if not open or portal container not ready
  if (!isOpen || !portalContainer) return null;

  const modalContent = (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      {/* Backdrop with CSS filter for better browser support */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "rgba(0, 0, 0, 0.1)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)", // Safari support
        }}
        onClick={handleCancel}
      />

      {/* Modal */}
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[95vh] overflow-y-auto transform transition-all duration-300 scale-100 border-2 border-gray-300 ring-4 ring-blue-500 ring-opacity-20 relative z-10"
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", zIndex: 10 }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-green-50 to-blue-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Add New Member
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Fill member details and complete fingerprint enrollment
              </p>
            </div>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
              disabled={isLoading}
            >
              <svg
                className="h-6 w-6"
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
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Gym Member ID (Optional) */}
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
              This ID will be used by gym staff to identify the member. Leave
              blank to assign later.
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
              Select a membership tier to set the monthly fee for this member.
            </p>
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

          {/* Enrollment Status */}
          {enrollmentState !== "idle" && (
            <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center space-x-3 mb-3">
                {getStatusIcon()}
                <span className="font-medium text-gray-800">
                  Enrollment Status
                </span>
              </div>
              <p className={`text-sm ${getStatusColor()} leading-relaxed`}>
                {enrollmentStatus}
              </p>
              {assignedFingerprintId && (
                <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
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
                    <p className="text-sm font-medium text-green-800">
                      Fingerprint ID: {assignedFingerprintId}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Instructions */}
          {enrollmentState === "idle" && (
            <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
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
              <ol className="text-sm text-blue-700 space-y-2 ml-2">
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">
                    1
                  </span>
                  Fill in member details above
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">
                    2
                  </span>
                  Click "Start Enrollment" button
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">
                    3
                  </span>
                  Follow fingerprint scanner instructions
                </li>
                <li className="flex items-start">
                  <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center mr-2 mt-0.5">
                    4
                  </span>
                  Member will be created with fingerprint ID
                </li>
              </ol>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-gray-200 transition-all duration-200 font-medium"
              disabled={isLoading}
            >
              {enrollmentState === "requesting" || enrollmentState === "waiting"
                ? "Cancel Enrollment"
                : "Cancel"}
            </button>

            {enrollmentState !== "success" && (
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-lg hover:shadow-xl"
                disabled={isLoading || !formData.Name.trim()}
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
                  <span>{isLoading ? "Enrolling..." : "Start Enrollment"}</span>
                </div>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, portalContainer);
};

export default NewMemberModal;
