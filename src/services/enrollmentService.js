// src/services/enrollmentService.js - FIXED VERSION with proper imports
import {
  collection,
  doc,
  setDoc,
  getDoc, // ✅ MISSING IMPORT - This was causing the error
  updateDoc,
  onSnapshot,
  serverTimestamp,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * Production-ready enrollment service with comprehensive error handling
 * and real-time communication with ESP32 devices
 */

// ==================== ENROLLMENT WORKFLOW ====================

/**
 * Creates enrollment request and waits for ESP32 to assign fingerprint ID
 * This is the main function called by the React UI
 * @param {string} gymId - The gym ID
 * @param {Object} memberData - Member information from form
 * @param {string} deviceId - Specific device ID (optional, defaults to main scanner)
 * @returns {Promise<Object>} - Complete enrollment result
 */
export const createMemberAndStartEnrollment = async (
  gymId,
  memberData,
  deviceId = "fingerprint_scanner_1"
) => {
  try {
    console.log("🎯 Starting production enrollment process");
    console.log("👤 Member:", memberData.Name);
    console.log("🏢 Gym:", gymId);
    console.log("📱 Device:", deviceId);

    // Validate input data
    validateMemberData(memberData);

    // Check device availability
    const deviceStatus = await checkDeviceStatus(gymId, deviceId);
    if (!deviceStatus.available) {
      throw new Error(
        `Device ${deviceId} is not available: ${deviceStatus.reason}`
      );
    }

    // Generate gym member ID if one isn't provided
    const gymMemberId =
      memberData.gymMemberId || (await generateGymMemberId(gymId));
    const enhancedMemberData = {
      ...memberData,
      gymMemberId,
    };

    // Step 1: Create enrollment command for ESP32
    const commandRef = doc(
      db,
      "gyms",
      gymId,
      "devices",
      deviceId,
      "commands",
      "enroll"
    );
    const tempEnrollmentId = `temp_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const enrollmentCommand = {
      status: "pending",
      tempId: tempEnrollmentId,
      memberName: memberData.Name,
      timestamp: serverTimestamp(),
      requestedBy: "react_app",
    };

    await setDoc(commandRef, enrollmentCommand);
    console.log("📡 Enrollment command sent to ESP32 device");

    // Step 2: Wait for ESP32 response with comprehensive monitoring
    const result = await waitForEnrollmentCompletion(
      gymId,
      deviceId,
      tempEnrollmentId
    );

    // Step 3: If enrollment on ESP32 was successful, create member in Firestore
    if (result.success && result.fingerprintId) {
      const membersCollectionRef = collection(db, "gyms", gymId, "members");
      const newMemberRef = doc(membersCollectionRef, result.fingerprintId.toString()); // Use fingerprint ID as document ID

      const finalMemberData = {
        ...enhancedMemberData,
        fingerprintId: parseInt(result.fingerprintId), // Store as number
        id: result.fingerprintId.toString(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        enrollmentStatus: "completed",
        enrolledBy: deviceId,
        enrollmentDate: serverTimestamp(),
      };

      await setDoc(newMemberRef, finalMemberData);
      console.log(
        `💾 Member record created in Firestore with Fingerprint ID: ${result.fingerprintId}`
      );

      console.log("✅ Enrollment process completed successfully");
      return {
        ...result,
        memberId: result.fingerprintId.toString(),
        gymMemberId: finalMemberData.gymMemberId,
        message: `Member ${memberData.Name} enrolled successfully with Fingerprint ID: ${result.fingerprintId}`,
      };
    } else {
      // Handle cases where the hardware part failed or didn't return an ID
      throw new Error(result.message || "Enrollment failed on the device.");
    }
  } catch (error) {
    console.error("❌ Enrollment process failed:", error);

    const enhancedError = {
      message: error.message,
      type: getErrorType(error),
      timestamp: new Date().toISOString(),
      gymId,
      deviceId,
      memberName: memberData.Name,
    };

    throw enhancedError;
  }
};

/**
 * Waits for ESP32 to complete enrollment with real-time updates
 * @param {string} gymId - Gym ID
 * @param {string} deviceId - Device ID
 * @param {string} tempId - Temporary enrollment ID
 * @returns {Promise<Object>} - Enrollment result
 */
const waitForEnrollmentCompletion = (gymId, deviceId, tempId) => {
  return new Promise((resolve, reject) => {
    const commandRef = doc(
      db,
      "gyms",
      gymId,
      "devices",
      deviceId,
      "commands",
      "enroll"
    );

    // Set up timeout with device-specific intervals
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(
        new Error(
          "Enrollment timeout - ESP32 device did not respond within 3 minutes"
        )
      );
    }, 180000); // 3 minutes for production use

    // Real-time listener for status changes
    const unsubscribe = onSnapshot(
      commandRef,
      (doc) => {
        if (doc.exists()) {
          const data = doc.data();

          console.log("📡 Real-time enrollment update:", {
            status: data.status,
            tempId: data.tempId,
            fingerprintId: data.fingerprintId,
            message: data.message,
          });

          // Check if this update is for our enrollment request
          if (data.tempId === tempId) {
            if (data.status === "completed" && data.fingerprintId) {
              clearTimeout(timeout);
              unsubscribe();

              resolve({
                success: true,
                fingerprintId: data.fingerprintId.toString(),
                memberName: data.memberName,
                message: data.message || "Enrollment completed successfully",
                enrollmentTime: data.timestamp,
                deviceId: deviceId,
              });
            } else if (data.status === "failed") {
              clearTimeout(timeout);
              unsubscribe();

              reject(
                new Error(data.message || "Enrollment failed - unknown error")
              );
            } else if (data.status === "in_progress") {
              console.log("🔄 Enrollment in progress on ESP32 device");
              // Continue waiting, enrollment is actively being processed
            } else if (data.status === "cancelled") {
              clearTimeout(timeout);
              unsubscribe();

              reject(new Error("Enrollment was cancelled"));
            }
          }
        }
      },
      (error) => {
        clearTimeout(timeout);
        console.error("❌ Firebase listener error:", error);
        reject(new Error(`Firebase connection error: ${error.message}`));
      }
    );
  });
};

// ==================== DEVICE MANAGEMENT ====================

/**
 * Checks if a device is available for enrollment
 * @param {string} gymId - Gym ID
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object>} - Device availability status
 */
export const checkDeviceStatus = async (gymId, deviceId) => {
  try {
    const deviceRef = doc(db, "gyms", gymId, "devices", deviceId);
    const deviceDoc = await getDoc(deviceRef);

    if (!deviceDoc.exists()) {
      return {
        available: false,
        reason:
          "Device not found - check device ID and ensure ESP32 is registered",
      };
    }

    const deviceData = deviceDoc.data();
    const lastSeen = deviceData.last_seen?.toDate();
    const now = new Date();
    const timeDiff = now - lastSeen;

    // Device is considered offline if not seen in last 2 minutes
    if (timeDiff > 120000) {
      return {
        available: false,
        reason: `Device offline - last seen ${Math.floor(
          timeDiff / 1000
        )}s ago`,
      };
    }

    if (deviceData.status !== "online") {
      return {
        available: false,
        reason: `Device status: ${deviceData.status}`,
      };
    }

    return {
      available: true,
      reason: "Device is online and ready",
      deviceInfo: {
        location: deviceData.location,
        version: deviceData.version,
        capabilities: deviceData.capabilities,
        uptime: deviceData.uptime_seconds,
      },
    };
  } catch (error) {
    console.error("❌ Error checking device status:", error);
    return {
      available: false,
      reason: `Error checking device: ${error.message}`,
    };
  }
};

/**
 * Gets all available devices for a gym
 * @param {string} gymId - Gym ID
 * @returns {Promise<Array>} - List of available devices
 */
export const getAvailableDevices = async (gymId) => {
  try {
    const devicesRef = collection(db, "gyms", gymId, "devices");
    const devicesSnapshot = await getDocs(devicesRef);

    const devices = [];
    const now = new Date();

    devicesSnapshot.forEach((doc) => {
      const deviceData = doc.data();
      const lastSeen = deviceData.last_seen?.toDate();
      const timeDiff = lastSeen ? now - lastSeen : Infinity;

      devices.push({
        id: doc.id,
        location: deviceData.location || "Unknown Location",
        status: deviceData.status || "unknown",
        isOnline: timeDiff < 120000, // Online if seen in last 2 minutes
        lastSeen: lastSeen,
        timeDiff: Math.floor(timeDiff / 1000),
        capabilities: deviceData.capabilities || {},
        version: deviceData.version || "unknown",
      });
    });

    return devices.sort((a, b) => a.location.localeCompare(b.location));
  } catch (error) {
    console.error("❌ Error fetching devices:", error);
    throw new Error("Could not fetch device list");
  }
};

// ==================== ENROLLMENT MONITORING ====================

/**
 * Sets up real-time listener for enrollment status updates
 * Used by React components to show live enrollment progress
 * @param {string} gymId - The gym ID
 * @param {string} deviceId - Device ID
 * @param {Function} onStatusChange - Callback for status updates
 * @returns {Function} - Unsubscribe function
 */
export const listenToEnrollmentStatus = (gymId, deviceId, onStatusChange) => {
  console.log(`🎧 Setting up enrollment listener for ${gymId}/${deviceId}`);

  const commandRef = doc(
    db,
    "gyms",
    gymId,
    "devices",
    deviceId,
    "commands",
    "enroll"
  );

  return onSnapshot(
    commandRef,
    (doc) => {
      if (doc.exists()) {
        const data = doc.data();

        // FIXED: Properly extract fingerprintId from Firestore format
        const statusUpdate = {
          status: data.status,
          fingerprintId: data.fingerprintId, // This should work now
          message: data.message,
          memberName: data.memberName,
          attempts: data.attempts || 0,
          timestamp: data.timestamp,
          tempId: data.tempId,
        };

        console.log("📡 Enrollment status update:", statusUpdate);
        onStatusChange(statusUpdate);
      }
    },
    (error) => {
      console.error("❌ Error in enrollment listener:", error);
      onStatusChange({
        status: "error",
        message: `Connection error: ${error.message}`,
      });
    }
  );
};

/**
 * Cancels an ongoing enrollment process
 * @param {string} gymId - The gym ID
 * @param {string} deviceId - Device ID
 * @returns {Promise<void>}
 */
export const cancelEnrollment = async (
  gymId,
  deviceId = "fingerprint_scanner_1"
) => {
  try {
    console.log(`❌ Cancelling enrollment on ${gymId}/${deviceId}`);

    const commandRef = doc(
      db,
      "gyms",
      gymId,
      "devices",
      deviceId,
      "commands",
      "enroll"
    );

    await updateDoc(commandRef, {
      status: "cancelled",
      timestamp: serverTimestamp(),
      cancelledBy: "react_app",
    });

    console.log("✅ Enrollment cancellation sent to ESP32");
  } catch (error) {
    console.error("❌ Error cancelling enrollment:", error);
    throw new Error("Failed to cancel enrollment");
  }
};

/**
 * Retries a failed enrollment
 * @param {string} gymId - The gym ID
 * @param {Object} memberData - The member data
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object>} - New enrollment result
 */
export const retryEnrollment = async (
  gymId,
  memberData,
  deviceId = "fingerprint_scanner_1"
) => {
  try {
    console.log(`🔄 Retrying enrollment for ${memberData.Name} on ${deviceId}`);

    // Add retry indicator to member data
    const retryMemberData = {
      ...memberData,
      retryAttempt: (memberData.retryAttempt || 0) + 1,
    };

    return await createMemberAndStartEnrollment(
      gymId,
      retryMemberData,
      deviceId
    );
  } catch (error) {
    console.error("❌ Error retrying enrollment:", error);
    throw new Error(`Retry failed: ${error.message}`);
  }
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * Validates member data before starting enrollment
 * @param {Object} memberData - Member data to validate
 * @throws {Error} - If validation fails
 */
const validateMemberData = (memberData) => {
  const requiredFields = ["Name"];
  const missingFields = requiredFields.filter(
    (field) => !memberData[field] || memberData[field].trim() === ""
  );

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
  }

  if (memberData.Name.length < 2) {
    throw new Error("Name must be at least 2 characters long");
  }

  if (memberData.Name.length > 50) {
    throw new Error("Name must be less than 50 characters long");
  }

  if (memberData.Age && (memberData.Age < 1 || memberData.Age > 120)) {
    throw new Error("Age must be between 1 and 120");
  }

  if (
    memberData.Phone_Number &&
    !/^[\d\s\-\+\(\)]+$/.test(memberData.Phone_Number)
  ) {
    throw new Error("Phone number contains invalid characters");
  }
};

/**
 * Generates a unique gym member ID
 * @param {string} gymId - Gym ID
 * @returns {Promise<string>} - Generated gym member ID
 */
const generateGymMemberId = async (gymId) => {
  try {
    const membersRef = collection(db, "gyms", gymId, "members");
    const snapshot = await getDocs(membersRef);
    const memberCount = snapshot.size + 1;

    // Format: FN001, FN002, etc.
    return `FN${memberCount.toString().padStart(3, "0")}`;
  } catch (error) {
    console.error("❌ Error generating gym member ID:", error);
    // Fallback to timestamp-based ID
    return `FN${Date.now().toString().slice(-6)}`;
  }
};

/**
 * Categorizes error types for better error handling
 * @param {Error} error - The error object
 * @returns {string} - Error category
 */
const getErrorType = (error) => {
  const message = error.message.toLowerCase();

  if (message.includes("timeout")) return "timeout";
  if (message.includes("device") && message.includes("offline"))
    return "device_offline";
  if (message.includes("firebase") || message.includes("firestore"))
    return "database_error";
  if (message.includes("network") || message.includes("connection"))
    return "network_error";
  if (message.includes("validation") || message.includes("required"))
    return "validation_error";
  if (message.includes("cancelled")) return "user_cancelled";
  if (message.includes("sensor") || message.includes("fingerprint"))
    return "hardware_error";

  return "unknown_error";
};

// ==================== ENROLLMENT STATISTICS ====================

/**
 * Gets enrollment statistics for dashboard
 * @param {string} gymId - Gym ID
 * @param {string} deviceId - Device ID (optional)
 * @returns {Promise<Object>} - Enrollment statistics
 */
export const getEnrollmentStats = async (gymId, deviceId = null) => {
  try {
    const membersRef = collection(db, "gyms", gymId, "members");
    let enrollmentQuery = membersRef;

    if (deviceId) {
      enrollmentQuery = query(membersRef, where("enrolledBy", "==", deviceId));
    }

    const membersSnapshot = await getDocs(enrollmentQuery);
    const members = membersSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const stats = {
      total: members.length,
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
      byDevice: {},
      recentEnrollments: [],
    };

    members.forEach((member) => {
      const enrollmentDate = member.enrollmentDate?.toDate();
      if (enrollmentDate) {
        if (enrollmentDate >= today) stats.today++;
        if (enrollmentDate >= thisWeek) stats.thisWeek++;
        if (enrollmentDate >= thisMonth) stats.thisMonth++;

        const device = member.enrolledBy || "unknown";
        stats.byDevice[device] = (stats.byDevice[device] || 0) + 1;

        if (stats.recentEnrollments.length < 10) {
          stats.recentEnrollments.push({
            name: member.Name,
            fingerprintId: member.fingerprintId,
            date: enrollmentDate,
            device: device,
          });
        }
      }
    });

    // Sort recent enrollments by date (newest first)
    stats.recentEnrollments.sort((a, b) => b.date - a.date);

    return stats;
  } catch (error) {
    console.error("❌ Error fetching enrollment stats:", error);
    throw new Error("Could not fetch enrollment statistics");
  }
};

export default {
  createMemberAndStartEnrollment,
  checkDeviceStatus,
  getAvailableDevices,
  listenToEnrollmentStatus,
  cancelEnrollment,
  retryEnrollment,
  getEnrollmentStats,
};