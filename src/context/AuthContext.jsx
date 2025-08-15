// src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../services/firebase";
import { getGymInfo } from "../services/authService";

const AuthContext = createContext({
  user: null,
  gymInfo: null,
  loading: true,
  error: null,
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [gymInfo, setGymInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log("🔧 AuthContext: Setting up auth state listener");

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log(
        "🔄 AuthContext: Auth state changed:",
        firebaseUser ? firebaseUser.email : "No user"
      );

      try {
        setError(null);

        if (firebaseUser) {
          console.log(
            "✅ AuthContext: User is authenticated:",
            firebaseUser.email
          );
          setUser(firebaseUser);

          // Check if gym info is already cached
          const cachedGymInfo = sessionStorage.getItem("gymInfo");

          if (cachedGymInfo) {
            console.log("📋 AuthContext: Using cached gym info");
            const parsedGymInfo = JSON.parse(cachedGymInfo);
            setGymInfo(parsedGymInfo);
            setLoading(false);
          } else {
            console.log("📋 AuthContext: Fetching gym info from Firestore");
            try {
              const fetchedGymInfo = await getGymInfo(firebaseUser.uid);
              setGymInfo(fetchedGymInfo);
              console.log(
                "✅ AuthContext: Gym info loaded:",
                fetchedGymInfo.name
              );
            } catch (gymError) {
              console.error(
                "❌ AuthContext: Failed to load gym info:",
                gymError
              );
              setError(gymError.message);
              // Don't set loading to false here, let the user try to reload
            }
            setLoading(false);
          }
        } else {
          console.log("❌ AuthContext: No user authenticated");
          setUser(null);
          setGymInfo(null);
          setLoading(false);
          // Clear any cached data
          sessionStorage.removeItem("gymInfo");
        }
      } catch (error) {
        console.error(
          "💥 AuthContext: Error in auth state change handler:",
          error
        );
        setError(error.message);
        setLoading(false);
      }
    });

    // Cleanup subscription on unmount
    return () => {
      console.log("🧹 AuthContext: Cleaning up auth listener");
      unsubscribe();
    };
  }, []);

  // Retry function for when gym info fails to load
  const retryGymInfo = async () => {
    if (!user) return;

    console.log("🔄 AuthContext: Retrying gym info fetch");
    setLoading(true);
    setError(null);

    try {
      const fetchedGymInfo = await getGymInfo(user.uid);
      setGymInfo(fetchedGymInfo);
      console.log("✅ AuthContext: Gym info retry successful");
    } catch (error) {
      console.error("❌ AuthContext: Gym info retry failed:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Function to manually refresh gym info
  const refreshGymInfo = async () => {
    if (!user) return;

    console.log("🔄 AuthContext: Manually refreshing gym info");

    // Clear cache first
    sessionStorage.removeItem("gymInfo");

    try {
      const fetchedGymInfo = await getGymInfo(user.uid);
      setGymInfo(fetchedGymInfo);
      console.log("✅ AuthContext: Gym info refreshed");
      return fetchedGymInfo;
    } catch (error) {
      console.error("❌ AuthContext: Failed to refresh gym info:", error);
      setError(error.message);
      throw error;
    }
  };

  // Context value
  const value = {
    user,
    gymInfo,
    loading,
    error,
    retryGymInfo,
    refreshGymInfo,
    // Helper functions
    isAuthenticated: !!user,
    hasGymInfo: !!gymInfo,
    isReady: !loading && !!user && !!gymInfo,
  };

  // Debug logging (only in development)
  if (import.meta.env.DEV) {
    console.log("🔍 AuthContext State:", {
      user: user?.email || "None",
      gymInfo: gymInfo?.name || "None",
      loading,
      error,
      isAuthenticated: value.isAuthenticated,
      hasGymInfo: value.hasGymInfo,
      isReady: value.isReady,
    });
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
