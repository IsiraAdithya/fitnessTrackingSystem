// src/services/authService.js

// Firebase SDK imports for Authentication
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";

// Firebase SDK imports for Firestore
import { doc, getDoc } from "firebase/firestore";

// Import your initialized Firebase Auth and Firestore instances
import { auth, db } from "./firebase";

/**
 * Attempts to log in a user with email and password.
 */
export const loginWithEmail = async (email, password, retryCount = 0) => {
  try {
    console.log(`🔐 Attempting login for: ${email}`);
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    console.log("✅ User authenticated successfully");

    const gymInfo = await getGymInfo(userCredential.user.uid);
    console.log("✅ Gym info loaded successfully");

    return {
      user: userCredential.user,
      gymInfo,
      success: true,
    };
  } catch (error) {
    console.error("❌ Login error:", error);
    if (isNetworkError(error) && retryCount < 2) {
      console.log(`🔄 Retrying login (attempt ${retryCount + 1}/3)...`);
      await delay(1000 * (retryCount + 1));
      return loginWithEmail(email, password, retryCount + 1);
    }
    return {
      error: getAuthErrorMessage(error.code),
      success: false,
    };
  }
};

/**
 * Retrieves gym information from Firestore for a given user ID.
 * Assumes Firestore structure:
 * /gym_admins/{userId} -> { gym_id: "..." }
 * /gyms/{gymId} -> { name: "...", address: "..." }
 */
export const getGymInfo = async (userId, retryCount = 0) => {
  try {
    console.log("📋 Loading gym info for user:", userId);

    const cachedGymInfo = sessionStorage.getItem("gymInfo");
    if (cachedGymInfo) {
      console.log("✅ Gym info loaded from cache");
      return JSON.parse(cachedGymInfo);
    }

    // 1. Get the admin document to find the gym_id
    const adminDocRef = doc(db, "gym_admins", userId);
    const adminDocSnap = await getDoc(adminDocRef);

    if (!adminDocSnap.exists()) {
      throw new Error(
        "No gym associated with this account. Please contact support."
      );
    }

    const adminData = adminDocSnap.data();
    const gymId = adminData.gym_id;

    if (!gymId) {
      throw new Error("Invalid gym assignment. Please contact support.");
    }

    console.log("🏢 Loading gym details for gymId:", gymId);

    // 2. Get the gym document using the gymId
    const gymDocRef = doc(db, "gyms", gymId);
    const gymDocSnap = await getDoc(gymDocRef);

    if (!gymDocSnap.exists()) {
      throw new Error("Gym information not found. Please contact support.");
    }

    const gymData = gymDocSnap.data();

    const gymInfo = {
      id: gymId,
      name: gymData.name || "Unknown Gym",
      address: gymData.address || "Address not specified",
      contact: gymData.contact || "Contact not specified",
      status: gymData.status || "active",
    };

    sessionStorage.setItem("gymInfo", JSON.stringify(gymInfo));
    console.log("✅ Gym info loaded and cached:", gymInfo.name);
    return gymInfo;
  } catch (error) {
    console.error("❌ Error getting gym info:", error);
    if (isNetworkError(error) && retryCount < 2) {
      console.log(
        `🔄 Retrying gym info fetch (attempt ${retryCount + 1}/3)...`
      );
      await delay(1000 * (retryCount + 1));
      return getGymInfo(userId, retryCount + 1);
    }
    throw new Error(error.message || "Failed to load gym information");
  }
};

/**
 * Signs out the current user.
 */
export const logout = async () => {
  try {
    console.log("🚪 Signing out user...");
    await signOut(auth);
    sessionStorage.clear();
    console.log("✅ User signed out successfully");
    return { success: true };
  } catch (error) {
    console.error("❌ Error signing out:", error);
    return { error: "Failed to sign out" };
  }
};

/**
 * Sends a password reset email.
 */
export const resetPassword = async (email) => {
  try {
    console.log("📧 Sending password reset email to:", email);
    await sendPasswordResetEmail(auth, email);
    console.log("✅ Password reset email sent");
    return { success: true };
  } catch (error) {
    console.error("❌ Password reset error:", error);
    return { error: getAuthErrorMessage(error.code) };
  }
};

// --- Utility Functions ---

const isNetworkError = (error) => {
  const networkErrorCodes = [
    "auth/network-request-failed",
    "auth/timeout",
    "unavailable",
    "cancelled",
    "deadline-exceeded",
  ];
  return networkErrorCodes.some(
    (code) =>
      error.code?.includes(code) ||
      error.message?.toLowerCase().includes("network") ||
      error.message?.toLowerCase().includes("timeout")
  );
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getAuthErrorMessage = (errorCode) => {
  const errorMessages = {
    "auth/user-not-found": "No account found with this email address.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-email": "Invalid email address format.",
    "auth/too-many-requests":
      "Too many failed attempts. Please try again in a few minutes.",
    "auth/user-disabled": "This account has been disabled. Contact support.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-credential": "Invalid email or password.",
    "auth/network-request-failed":
      "Network error. Please check your internet connection.",
    "permission-denied":
      "Access denied. You do not have permission to perform this action.",
  };
  return (
    errorMessages[errorCode] ||
    "An unexpected error occurred. Please try again."
  );
};
