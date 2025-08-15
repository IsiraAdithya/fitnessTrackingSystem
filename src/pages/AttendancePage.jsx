// src/pages/AttendancePage.jsx - Complete Updated Version with Grouped Display
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/layout/Layout";
import toast from "react-hot-toast";
import {
  getAttendanceForDate,
  getGroupedAttendanceForDate,
  getTodayAttendanceSummary,
  searchAttendanceRecords,
  searchGroupedAttendanceRecords,
  recordAttendance,
} from "../services/attendanceService";
import { getMembersForGym } from "../services/memberService";

const AttendancePage = () => {
  const { gymInfo } = useAuth();

  // State management
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [attendanceData, setAttendanceData] = useState([]);
  const [groupedAttendanceData, setGroupedAttendanceData] = useState([]);
  const [viewMode, setViewMode] = useState("grouped"); // 'grouped' or 'detailed'
  const [expandedMembers, setExpandedMembers] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [todaySummary, setTodaySummary] = useState({
    totalCheckIns: 0,
    activeMembers: 0,
    paidMembersCheckIns: 0,
    unpaidMembersCheckIns: 0,
    peakHour: null,
  });
  const [isManualAttendanceModalOpen, setIsManualAttendanceModalOpen] =
    useState(false);
  const [selectedMemberForManual, setSelectedMemberForManual] = useState(null);
  const [members, setMembers] = useState([]);

  // Refs for real-time listeners
  const attendanceListeners = useRef(new Map());
  const lastRecordCount = useRef(0);
  const isInitialLoad = useRef(true);

  const isToday = useCallback((dateString) => {
    const today = new Date().toISOString().split("T")[0];
    return dateString === today;
  }, []);
  // Function to fetch members for the dropdown
  const fetchMembers = useCallback(async () => {
    if (!gymInfo?.id) return;

    try {
      console.log("📋 Fetching members for manual attendance");
      const membersData = await getMembersForGym(gymInfo.id);
      setMembers(membersData);
      console.log(`✅ Loaded ${membersData.length} members`);
    } catch (error) {
      console.error("❌ Error fetching members:", error);
      toast.error("Failed to load members list");
    }
  }, [gymInfo]);

  // Function to handle manual check-in
  const handleManualCheckIn = async () => {
    if (!selectedMemberForManual) {
      toast.error("Please select a member");
      return;
    }

    try {
      console.log(
        "🔧 Processing manual check-in for member:",
        selectedMemberForManual
      );

      // Use your existing recordAttendance function
      await recordAttendance(gymInfo.id, selectedMemberForManual, {
        recordedBy: "manual",
      });

      toast.success("Manual check-in recorded successfully!");

      // Close modal and refresh data
      setIsManualAttendanceModalOpen(false);
      setSelectedMemberForManual(null);

      // Refresh attendance data
      fetchAttendanceData(false);
    } catch (error) {
      console.error("❌ Manual check-in failed:", error);
      toast.error("Failed to record manual check-in: " + error.message);
    }
  };
  // Real-time attendance data fetcher
  const fetchAttendanceData = useCallback(
    async (showLoading = true) => {
      if (!gymInfo?.id) return;

      try {
        if (showLoading) {
          setLoading(true);
        }

        console.log(`📅 Fetching attendance for ${selectedDate}`);

        // Fetch both detailed and grouped data
        const [detailedData, groupedData] = await Promise.all([
          getAttendanceForDate(gymInfo.id, selectedDate),
          getGroupedAttendanceForDate(gymInfo.id, selectedDate),
        ]);

        setAttendanceData(detailedData);
        setGroupedAttendanceData(groupedData);

        // Show toast for new records (but not on initial load)
        if (
          !isInitialLoad.current &&
          detailedData.length > lastRecordCount.current
        ) {
          const newRecords = detailedData.length - lastRecordCount.current;
          toast.success(
            `🔥 ${newRecords} new attendance record${
              newRecords > 1 ? "s" : ""
            } added!`,
            {
              duration: 4000,
              style: {
                background: "#10B981",
                color: "white",
              },
            }
          );
        }

        lastRecordCount.current = detailedData.length;
        isInitialLoad.current = false;

        console.log(
          `✅ Loaded ${detailedData.length} detailed records, ${groupedData.length} member groups`
        );
      } catch (error) {
        console.error("❌ Error fetching attendance:", error);
        toast.error("Failed to load attendance data");
        setAttendanceData([]);
        setGroupedAttendanceData([]);
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [gymInfo?.id, selectedDate]
  );

  // Real-time today summary fetch
  const fetchTodaySummary = useCallback(async () => {
    if (!gymInfo?.id || !isToday(selectedDate)) return;

    try {
      const summary = await getTodayAttendanceSummary(gymInfo.id);
      setTodaySummary(summary);
      console.log("📊 Today summary updated:", summary);
    } catch (error) {
      console.error("❌ Error fetching today summary:", error);
    }
  }, [gymInfo?.id, selectedDate, isToday]);

  // Setup real-time Firebase listeners
  const setupRealTimeListeners = useCallback(async () => {
    if (!gymInfo?.id) return;

    // Import Firebase functions dynamically
    const { collection, onSnapshot, query } = await import(
      "firebase/firestore"
    );
    const { db } = await import("../services/firebase");

    // Clear existing listeners
    attendanceListeners.current.forEach((unsubscribe) => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    });
    attendanceListeners.current.clear();

    console.log("🔄 Setting up real-time listeners for attendance changes...");

    try {
      // Listen to ALL attendance documents for the current gym
      const attendanceCollectionRef = collection(
        db,
        "gyms",
        gymInfo.id,
        "attendance"
      );
      const attendanceQuery = query(attendanceCollectionRef);

      const unsubscribeAttendance = onSnapshot(
        attendanceQuery,
        (snapshot) => {
          console.log("🔥 Real-time update detected in attendance collection!");

          // Check if any changes are relevant to our current date
          let hasRelevantChanges = false;
          const targetDatePrefix = selectedDate;

          snapshot.docChanges().forEach((change) => {
            const docId = change.doc.id;

            // Check if this document is for our current selected date
            if (docId.startsWith(targetDatePrefix)) {
              hasRelevantChanges = true;

              if (change.type === "added") {
                console.log(`✅ New attendance record added: ${docId}`);
              } else if (change.type === "modified") {
                console.log(`📝 Attendance record updated: ${docId}`);
              } else if (change.type === "removed") {
                console.log(`🗑️ Attendance record removed: ${docId}`);
              }
            }
          });

          // Only refresh if there are relevant changes for our selected date
          if (hasRelevantChanges) {
            console.log(
              "🔄 Refreshing attendance data due to relevant changes..."
            );
            fetchAttendanceData(false); // Don't show loading spinner

            // Also update today's summary if we're viewing today
            if (isToday(selectedDate)) {
              fetchTodaySummary();
            }
          }
        },
        (error) => {
          console.error("❌ Real-time listener error:", error);
          toast.error(
            "Real-time updates disconnected. Click refresh to reload.",
            {
              duration: 8000,
            }
          );
        }
      );

      // Store the unsubscribe function
      attendanceListeners.current.set("attendance", unsubscribeAttendance);

      // Show real-time status
      toast.success(
        "🔥 Live updates active - instant notifications on new check-ins!",
        {
          duration: 3000,
          icon: "⚡",
        }
      );
    } catch (error) {
      console.error("❌ Failed to setup real-time listeners:", error);
      toast.error("Could not enable live updates. Manual refresh available.");
    }
  }, [
    gymInfo?.id,
    selectedDate,
    fetchAttendanceData,
    fetchTodaySummary,
    isToday,
  ]);

  // Main effect - fetch data and setup listeners when date or gym changes
  useEffect(() => {
    if (gymInfo?.id) {
      console.log(`📅 Date changed to: ${selectedDate}`);

      // Reset initial load flag when date changes
      isInitialLoad.current = true;
      lastRecordCount.current = 0;

      // Fetch initial data
      fetchAttendanceData(true);

      // Fetch today's summary if needed
      if (isToday(selectedDate)) {
        fetchTodaySummary();
      }

      // Setup real-time listeners
      setupRealTimeListeners();
    }

    // Cleanup listeners on date change
    return () => {
      attendanceListeners.current.forEach((unsubscribe) => {
        if (typeof unsubscribe === "function") {
          unsubscribe();
        }
      });
      attendanceListeners.current.clear();
    };
  }, [
    gymInfo?.id,
    selectedDate,
    fetchAttendanceData,
    fetchTodaySummary,
    setupRealTimeListeners,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      attendanceListeners.current.forEach((unsubscribe) => {
        if (typeof unsubscribe === "function") {
          unsubscribe();
        }
      });
      attendanceListeners.current.clear();
    };
  }, []);

  // Search with real-time updates
  const handleSearch = useCallback(
    async (term) => {
      setSearchTerm(term);

      if (!term.trim()) {
        await fetchAttendanceData(false);
        return;
      }

      try {
        if (viewMode === "grouped") {
          const results = await searchGroupedAttendanceRecords(
            gymInfo.id,
            term,
            selectedDate
          );
          setGroupedAttendanceData(results);
        } else {
          const results = await searchAttendanceRecords(
            gymInfo.id,
            term,
            selectedDate
          );
          setAttendanceData(results);
        }
        console.log(`🔍 Search results: ${viewMode} mode`);
      } catch (error) {
        console.error("❌ Search error:", error);
        toast.error("Search failed");
      }
    },
    [gymInfo?.id, selectedDate, fetchAttendanceData, viewMode]
  );

  // Manual refresh handler
  const handleManualRefresh = useCallback(async () => {
    console.log("🔄 Manual refresh triggered");
    await fetchAttendanceData(false);
    if (isToday(selectedDate)) {
      await fetchTodaySummary();
    }
    toast.success("Data refreshed successfully!");
  }, [fetchAttendanceData, fetchTodaySummary, selectedDate, isToday]);

  // Date change handler
  const handleDateChange = useCallback(
    (newDate) => {
      console.log(`📅 Changing date from ${selectedDate} to ${newDate}`);
      setSelectedDate(newDate);
      setSearchTerm(""); // Clear search when changing dates
      setExpandedMembers(new Set()); // Clear expanded members
    },
    [selectedDate]
  );

  // Toggle member expansion
  const toggleMemberExpansion = useCallback((memberId) => {
    setExpandedMembers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(memberId)) {
        newSet.delete(memberId);
      } else {
        newSet.add(memberId);
      }
      return newSet;
    });
  }, []);

  useEffect(() => {
    if (gymInfo?.id) {
      fetchMembers();
    }
  }, [gymInfo, fetchMembers]);

  const formatTime = useCallback((timestamp) => {
    if (!timestamp) return "-";

    try {
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch (error) {
      return "-";
    }
  }, []);

  const formatDuration = useCallback((minutes) => {
    if (!minutes || minutes <= 0) return "-";

    if (minutes < 60) {
      return `${minutes}m`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0
        ? `${hours}h ${remainingMinutes}m`
        : `${hours}h`;
    }
  }, []);

  const formatDate = useCallback((dateString) => {
    try {
      const date = new Date(dateString + "T00:00:00");
      return date.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch (error) {
      return dateString;
    }
  }, []);

  // Show loading only on initial load
  if (
    loading &&
    attendanceData.length === 0 &&
    groupedAttendanceData.length === 0
  ) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading attendance data...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Attendance Management
              </h1>
              <p className="text-gray-600 mt-1">
                Track and manage member attendance
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleManualRefresh}
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
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>Refresh</span>
                {/* ← ADD THIS NEW MANUAL ATTENDANCE BUTTON: */}
                <button
                  onClick={() => {
                    fetchMembers(); // Load members when opening modal
                    setIsManualAttendanceModalOpen(true);
                  }}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
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
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                  <span>Manual Check-in</span>
                </button>
              </button>
            </div>
          </div>
        </div>

        {/* Today's Summary Cards - Only show for today */}
        {isToday(selectedDate) && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-6 transform transition-all hover:scale-105">
              <div className="flex items-center">
                <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg
                    className="h-4 w-4 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    Total Sessions
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {todaySummary.totalCheckIns}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 transform transition-all hover:scale-105">
              <div className="flex items-center">
                <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
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
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    Unique Members
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {groupedAttendanceData.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 transform transition-all hover:scale-105">
              <div className="flex items-center">
                <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
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
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
                    />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    Paid Members Today
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {
                      groupedAttendanceData.filter(
                        (m) => m.paymentStatus === "Paid"
                      ).length
                    }
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 transform transition-all hover:scale-105">
              <div className="flex items-center">
                <div className="h-8 w-8 bg-red-100 rounded-full flex items-center justify-center">
                  <svg
                    className="h-4 w-4 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    Currently In Gym
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {
                      groupedAttendanceData.filter(
                        (m) => m.currentStatus === "IN"
                      ).length
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="bg-white shadow-sm rounded-lg p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Date Selector */}
            <div className="flex items-center space-x-4">
              <div>
                <label
                  htmlFor="date"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Select Date
                </label>
                <input
                  type="date"
                  id="date"
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div className="text-sm text-gray-600 mt-6">
                {formatDate(selectedDate)}
              </div>
            </div>

            {/* Search */}
            <div className="flex-1 max-w-md">
              <label
                htmlFor="search"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Search Members
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="search"
                  placeholder="Search by name or gym member ID..."
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <svg
                  className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">View:</span>
              <button
                onClick={() => setViewMode("grouped")}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  viewMode === "grouped"
                    ? "bg-green-100 text-green-800"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                Grouped
              </button>
              <button
                onClick={() => setViewMode("detailed")}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  viewMode === "detailed"
                    ? "bg-green-100 text-green-800"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                All Sessions
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <span>
              Showing{" "}
              {viewMode === "grouped"
                ? groupedAttendanceData.length
                : attendanceData.length}
              {viewMode === "grouped" ? " member" : " attendance record"}
              {(viewMode === "grouped"
                ? groupedAttendanceData.length
                : attendanceData.length) !== 1
                ? "s"
                : ""}
              {searchTerm && ` for "${searchTerm}"`}
            </span>
            <div className="flex items-center space-x-2">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>Real-time updates active ⚡</span>
            </div>
          </div>
        </div>

        {/* Attendance Table */}
        <div className="bg-white shadow-sm rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            {viewMode === "grouped" ? (
              // Grouped View Table
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Member
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sessions Today
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      First Check-in
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Check-out
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {groupedAttendanceData.map((memberGroup) => (
                    <React.Fragment key={memberGroup.memberId}>
                      {/* Main Row */}
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-8 w-8 bg-gray-200 rounded-full flex items-center justify-center">
                              <span className="text-sm font-medium text-gray-600">
                                {memberGroup.memberName
                                  ? memberGroup.memberName
                                      .charAt(0)
                                      .toUpperCase()
                                  : "U"}
                              </span>
                            </div>
                            <div className="ml-3">
                              <div className="text-sm font-medium text-gray-900">
                                {memberGroup.memberName || "Unknown Member"}
                              </div>
                              <div className="text-sm text-gray-500">
                                ID: {memberGroup.gymMemberId || "Not Set"}
                              </div>
                              {import.meta.env.DEV && (
                                <div className="text-xs text-gray-400">
                                  System: {memberGroup.memberId}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-gray-900">
                              {memberGroup.totalSessions}
                            </span>
                            <span className="text-xs text-gray-500">
                              session
                              {memberGroup.totalSessions !== 1 ? "s" : ""}
                            </span>
                            {memberGroup.totalTimeSpent > 0 && (
                              <span className="text-xs text-blue-600">
                                ({formatDuration(memberGroup.totalTimeSpent)}{" "}
                                total)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatTime(memberGroup.firstCheckIn)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatTime(memberGroup.lastCheckOut)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                              memberGroup.currentStatus === "IN"
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {memberGroup.currentStatus === "IN"
                              ? "🟢 IN GYM"
                              : "🔘 CHECKED OUT"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                              memberGroup.paymentStatus === "Paid"
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {memberGroup.paymentStatus || "Unknown"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() =>
                              toggleMemberExpansion(memberGroup.memberId)
                            }
                            className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50 transition-colors flex items-center space-x-1"
                            title={
                              expandedMembers.has(memberGroup.memberId)
                                ? "Collapse sessions"
                                : "Expand sessions"
                            }
                          >
                            <svg
                              className={`h-4 w-4 transform transition-transform ${
                                expandedMembers.has(memberGroup.memberId)
                                  ? "rotate-180"
                                  : ""
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 9l-7 7-7-7"
                              />
                            </svg>
                            <span className="text-xs">
                              {expandedMembers.has(memberGroup.memberId)
                                ? "Hide"
                                : "Show"}{" "}
                              Sessions
                            </span>
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Sessions */}
                      {expandedMembers.has(memberGroup.memberId) && (
                        <tr>
                          <td colSpan="7" className="px-6 py-2 bg-gray-50">
                            <div className="pl-8">
                              <h4 className="text-sm font-medium text-gray-700 mb-2">
                                Session Details for {memberGroup.memberName}
                              </h4>
                              <div className="space-y-2">
                                {memberGroup.sessions.map((session, index) => (
                                  <div
                                    key={session.sessionId}
                                    className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200"
                                  >
                                    <div className="flex items-center space-x-4">
                                      <div className="h-6 w-6 bg-blue-100 rounded-full flex items-center justify-center">
                                        <span className="text-xs font-medium text-blue-600">
                                          {index + 1}
                                        </span>
                                      </div>
                                      <div>
                                        <div className="text-sm font-medium text-gray-900">
                                          {session.sessionId ||
                                            `Session ${index + 1}`}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          Check-in:{" "}
                                          {formatTime(session.checkInTime)}
                                          {session.checkOutTime && (
                                            <>
                                              {" "}
                                              • Check-out:{" "}
                                              {formatTime(session.checkOutTime)}
                                            </>
                                          )}
                                          {session.duration && (
                                            <>
                                              {" "}
                                              • Duration:{" "}
                                              {formatDuration(session.duration)}
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <span
                                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                          session.checkOutTime
                                            ? "bg-gray-100 text-gray-700"
                                            : "bg-green-100 text-green-700"
                                        }`}
                                      >
                                        {session.checkOutTime
                                          ? "Completed"
                                          : "Active"}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            ) : (
              // Detailed View Table (Original)
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Member
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Check-in Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Check-out Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {attendanceData.map((record) => (
                    <tr
                      key={record.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-8 w-8 bg-gray-200 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-gray-600">
                              {record.memberName
                                ? record.memberName.charAt(0).toUpperCase()
                                : "U"}
                            </span>
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900">
                              {record.memberName || "Unknown Member"}
                            </div>
                            <div className="text-sm text-gray-500">
                              ID: {record.gymMemberId || "Not Set"}
                            </div>
                            {import.meta.env.DEV && (
                              <div className="text-xs text-gray-400">
                                System: {record.memberId}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatTime(record.checkInTime)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatTime(record.checkOutTime)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                            record.paymentStatus === "Paid"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {record.paymentStatus || "Unknown"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {((viewMode === "grouped" && groupedAttendanceData.length === 0) ||
            (viewMode === "detailed" && attendanceData.length === 0)) &&
            !loading && (
              <div className="text-center py-12">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v1a2 2 0 002 2h2m0 0v9a2 2 0 002 2h2a2 2 0 002-2v-9m0 0h2a2 2 0 002-2v-1a2 2 0 00-2-2h-2m-6 4h4"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  No attendance records
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {searchTerm
                    ? `No records found for "${searchTerm}" on ${formatDate(
                        selectedDate
                      )}`
                    : `No one has checked in on ${formatDate(
                        selectedDate
                      )} yet.`}
                </p>
                <p className="mt-2 text-xs text-gray-400">
                  ⚡ Real-time updates are active - new check-ins will appear
                  instantly
                </p>
              </div>
            )}
        </div>

        {/* View Mode Status */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-sm text-blue-800">
              <div className="h-2 w-2 bg-blue-500 rounded-full"></div>
              <span>
                Currently viewing:{" "}
                <strong>
                  {viewMode === "grouped" ? "Grouped" : "Detailed"}
                </strong>{" "}
                mode
              </span>
            </div>
            <div className="text-xs text-blue-600">
              {viewMode === "grouped"
                ? "One row per member with expandable sessions"
                : "All individual sessions displayed separately"}
            </div>
          </div>
        </div>

        {/* Real-time Status Indicator */}
        {import.meta.env.DEV && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center space-x-2 text-sm text-green-800">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>⚡ Real-time Firebase listeners active</span>
              <span className="text-green-600">
                ({attendanceListeners.current.size} listener
                {attendanceListeners.current.size !== 1 ? "s" : ""} connected)
              </span>
            </div>
          </div>
        )}
        {/* Manual Attendance Modal - REPLACE THE EXISTING MODAL */}
        {isManualAttendanceModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Manual Check-in
                <span className="text-sm text-gray-500 ml-2">
                  (For unpaid members allowed by gym owner)
                </span>
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Member
                  </label>
                  <select
                    value={selectedMemberForManual || ""}
                    onChange={(e) => setSelectedMemberForManual(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select a member...</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.Name} - {member.gymMemberId}
                        {member.Payment_Status === "Unpaid"
                          ? " (UNPAID)"
                          : " (PAID)"}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Unpaid members are typically rejected by fingerprint device
                  </p>
                </div>

                {/* Show member info if selected */}
                {selectedMemberForManual && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    {(() => {
                      const member = members.find(
                        (m) => m.id === selectedMemberForManual
                      );
                      return member ? (
                        <div className="text-sm">
                          <p>
                            <strong>Name:</strong> {member.Name}
                          </p>
                          <p>
                            <strong>ID:</strong> {member.gymMemberId}
                          </p>
                          <p>
                            <strong>Status:</strong>
                            <span
                              className={`ml-1 px-2 py-1 rounded text-xs ${
                                member.Payment_Status === "Paid"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {member.Payment_Status}
                            </span>
                          </p>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => {
                    setIsManualAttendanceModalOpen(false);
                    setSelectedMemberForManual(null);
                  }}
                  className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleManualCheckIn}
                  disabled={!selectedMemberForManual}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Record Check-in
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AttendancePage;
