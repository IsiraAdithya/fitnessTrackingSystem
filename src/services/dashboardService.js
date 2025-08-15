// src/services/dashboardService.js - FIXED VERSION
import {
  collection,
  query,
  getDocs,
  where,
  orderBy,
  onSnapshot,
  doc,
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * Calculates actual monthly revenue from payment history
 * @param {string} gymId - The gym ID
 * @param {string} month - Month in YYYY-MM format (optional, defaults to current month)
 * @returns {Promise<number>} Actual revenue for the month
 */
const calculateActualMonthlyRevenue = async (gymId, month = null) => {
  try {
    // Use current month if not specified
    const targetMonth = month || new Date().toISOString().substring(0, 7);
    console.log(`💰 Calculating actual revenue for month: ${targetMonth}`);

    let totalRevenue = 0;
    let paymentCount = 0;

    // Get all members to access their payment history
    const membersRef = collection(db, "gyms", gymId, "members");
    const membersSnapshot = await getDocs(membersRef);

    membersSnapshot.docs.forEach((doc) => {
      const memberData = doc.data();

      // Check if member has payment history
      if (
        memberData.paymentHistory &&
        Array.isArray(memberData.paymentHistory)
      ) {
        memberData.paymentHistory.forEach((payment) => {
          // Extract month from payment date (assuming YYYY-MM-DD format)
          const paymentMonth = payment.date
            ? payment.date.substring(0, 7)
            : null;

          if (paymentMonth === targetMonth && payment.amount) {
            totalRevenue += Number(payment.amount);
            paymentCount++;
            console.log(
              `✅ Added payment: ${payment.amount} from ${
                memberData.Name || "Unknown"
              }`
            );
          }
        });
      }
    });

    console.log(
      `💰 Total actual revenue for ${targetMonth}: ${totalRevenue} (${paymentCount} payments)`
    );
    return { revenue: totalRevenue, paymentCount };
  } catch (error) {
    console.error("❌ Error calculating actual monthly revenue:", error);
    return { revenue: 0, paymentCount: 0 };
  }
};

/**
 * Calculates estimated monthly revenue based on membership tiers
 * @param {string} gymId - The gym ID
 * @returns {Promise<number>} Estimated monthly revenue
 */
const calculateEstimatedMonthlyRevenue = async (gymId) => {
  try {
    console.log(`📊 Calculating estimated monthly revenue for gym: ${gymId}`);

    // Get all members with their membership tier information
    const membersRef = collection(db, "gyms", gymId, "members");
    const membersSnapshot = await getDocs(membersRef);

    // Get membership tiers to get actual prices
    const tiersRef = collection(db, "gyms", gymId, "membershipTiers");
    const tiersSnapshot = await getDocs(tiersRef);

    // Create tier price map
    const tierPrices = {};
    tiersSnapshot.docs.forEach((doc) => {
      const tier = doc.data();
      tierPrices[doc.id] = tier.price || 0;
    });

    let estimatedRevenue = 0;
    let paidMembersCount = 0;

    membersSnapshot.docs.forEach((doc) => {
      const memberData = doc.data();

      // Only count paid members
      if (memberData.Payment_Status === "Paid") {
        paidMembersCount++;

        // Get member's tier price
        const tierPrice = memberData.membershipTierId
          ? tierPrices[memberData.membershipTierId] || 500 // fallback to 500
          : 500; // default price if no tier

        estimatedRevenue += tierPrice;
      }
    });

    console.log(
      `📊 Estimated revenue: ${estimatedRevenue} (${paidMembersCount} paid members)`
    );
    return { revenue: estimatedRevenue, paidMembers: paidMembersCount };
  } catch (error) {
    console.error("❌ Error calculating estimated monthly revenue:", error);
    return { revenue: 0, paidMembers: 0 };
  }
};

/**
 * Fetches dashboard statistics for a specific gym - IMPROVED VERSION
 * @param {string} gymId - The gym ID to fetch stats for
 * @returns {Promise<Object>} Dashboard statistics object
 */
export const getDashboardStats = async (gymId) => {
  try {
    console.log(`📊 Fetching enhanced dashboard stats for gym: ${gymId}`);

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayString = today.toISOString().split("T")[0];
    const currentMonth = today.toISOString().substring(0, 7);

    console.log(`📅 Today: ${todayString}, Current Month: ${currentMonth}`);

    // Initialize stats object
    const stats = {
      totalMembers: 0,
      paidMembers: 0,
      unpaidMembers: 0,
      todayAttendance: 0,
      monthlyRevenue: 0,
      estimatedRevenue: 0,
      actualRevenue: 0,
      paymentCount: 0,
      activeDevices: 1,
      lastUpdated: new Date().toISOString(),
    };

    // 1. Get total members and payment status counts
    console.log("🔍 Fetching members data...");
    const membersRef = collection(db, "gyms", gymId, "members");
    const membersSnapshot = await getDocs(membersRef);

    stats.totalMembers = membersSnapshot.size;

    // Count paid/unpaid members
    membersSnapshot.docs.forEach((doc) => {
      const memberData = doc.data();
      if (memberData.Payment_Status === "Paid") {
        stats.paidMembers++;
      } else {
        stats.unpaidMembers++;
      }
    });

    console.log(
      `✅ Members stats: Total: ${stats.totalMembers}, Paid: ${stats.paidMembers}, Unpaid: ${stats.unpaidMembers}`
    );

    // 2. Get today's attendance count
    console.log("🔍 Fetching today's attendance...");
    try {
      // Use getTodayAttendanceSummary function that already works
      const { getTodayAttendanceSummary } = await import("./attendanceService");
      const todaySummary = await getTodayAttendanceSummary(gymId);
      stats.todayAttendance = todaySummary.totalCheckIns;

      console.log(`✅ Today's attendance: ${stats.todayAttendance}`);
    } catch (attendanceError) {
      console.log("ℹ️ No attendance data for today, setting to 0");
      stats.todayAttendance = 0;
    }

    // 3. Calculate BOTH actual and estimated monthly revenue
    console.log("💰 Calculating revenue metrics...");

    // Get actual revenue from payment history
    const actualData = await calculateActualMonthlyRevenue(gymId, currentMonth);
    stats.actualRevenue = actualData.revenue;
    stats.paymentCount = actualData.paymentCount;

    // Get estimated revenue from membership tiers
    const estimatedData = await calculateEstimatedMonthlyRevenue(gymId);
    stats.estimatedRevenue = estimatedData.revenue;

    // Use actual revenue if available, otherwise use estimated
    stats.monthlyRevenue =
      stats.actualRevenue > 0 ? stats.actualRevenue : stats.estimatedRevenue;

    console.log("💰 Revenue Summary:", {
      actual: stats.actualRevenue,
      estimated: stats.estimatedRevenue,
      displayed: stats.monthlyRevenue,
      paymentCount: stats.paymentCount,
    });

    // 4. Device status (could be enhanced with real device monitoring)
    stats.activeDevices = 1; // For now, assuming one ESP32

    // 5. Return complete stats
    console.log("📊 Final enhanced dashboard stats:", stats);
    return stats;
  } catch (error) {
    console.error("❌ Error fetching dashboard stats:", error);

    // Return default stats in case of error
    return {
      totalMembers: 0,
      paidMembers: 0,
      unpaidMembers: 0,
      todayAttendance: 0,
      monthlyRevenue: 0,
      actualRevenue: 0,
      estimatedRevenue: 0,
      paymentCount: 0,
      activeDevices: 0,
      lastUpdated: new Date().toISOString(),
      error: error.message,
    };
  }
};

/**
 * Sets up real-time listener for dashboard updates
 * @param {string} gymId - The gym ID
 * @param {Function} callback - Callback function to call when data changes
 * @returns {Function} Unsubscribe function
 */
export const subscribeToDashboardUpdates = (gymId, callback) => {
  console.log("🔄 Setting up real-time dashboard updates...");

  const membersRef = collection(db, "gyms", gymId, "members");

  return onSnapshot(
    membersRef,
    (snapshot) => {
      console.log("🔔 Members collection changed, refreshing dashboard...");

      // Check if any payment-related changes occurred
      const hasPaymentChanges = snapshot.docChanges().some((change) => {
        if (change.type === "modified") {
          const data = change.doc.data();
          return (
            data.Payment_Status || data.paymentHistory || data.membershipTierId
          );
        }
        return change.type === "added" || change.type === "removed";
      });

      if (hasPaymentChanges) {
        console.log(
          "💰 Payment-related changes detected, triggering callback..."
        );
        callback();
      }
    },
    (error) => {
      console.error("❌ Dashboard real-time listener error:", error);
    }
  );
};

/**
 * Fetches recent attendance data for charts/trends - FIXED VERSION
 * @param {string} gymId - The gym ID
 * @param {number} days - Number of days to fetch (default 7)
 * @returns {Promise<Array>} Array of attendance data for the past N days
 */
export const getRecentAttendanceData = async (gymId, days = 7) => {
  try {
    console.log(`📈 Fetching attendance data for last ${days} days`);

    const attendanceData = [];
    const today = new Date();

    // Import the correct function
    const { getAttendanceForDate } = await import("./attendanceService");

    // Get data for the last N days
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateString = date.toISOString().split("T")[0];

      try {
        // Use your existing working function
        const dayAttendance = await getAttendanceForDate(gymId, dateString);

        attendanceData.push({
          date: dateString,
          count: dayAttendance.length, // Count of attendance records
          formattedDate: date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
        });

        console.log(`📊 ${dateString}: ${dayAttendance.length} check-ins`);
      } catch (error) {
        // If no data for this date, add 0
        attendanceData.push({
          date: dateString,
          count: 0,
          formattedDate: date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
        });
        console.log(`📊 ${dateString}: 0 check-ins (no data)`);
      }
    }

    console.log("📈 Weekly attendance data:", attendanceData);
    return attendanceData;
  } catch (error) {
    console.error("❌ Error fetching recent attendance data:", error);
    return Array.from({ length: days }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      return {
        date: date.toISOString().split("T")[0],
        count: 0,
        formattedDate: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
      };
    });
  }
};

/**
 * Fetches the most recent member activities
 * @param {string} gymId - The gym ID
 * @param {number} limit - Number of recent activities to fetch
 * @returns {Promise<Array>} Array of recent activities
 */
export const getRecentMemberActivities = async (gymId, limit = 5) => {
  try {
    console.log(`🔄 Fetching ${limit} recent member activities`);

    const activities = [];
    const today = new Date();

    // Look at the last 7 days for activities
    for (let i = 0; i < 7 && activities.length < limit; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateString = date.toISOString().split("T")[0];

      try {
        const attendanceRef = collection(
          db,
          "gyms",
          gymId,
          "attendance",
          dateString,
          "sessions"
        );
        const q = query(attendanceRef, orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);

        snapshot.docs.forEach((doc) => {
          if (activities.length < limit) {
            const sessionData = doc.data();
            activities.push({
              id: doc.id,
              type: "check-in",
              memberName: sessionData.memberName || "Unknown Member",
              timestamp: sessionData.timestamp,
              date: dateString,
              ...sessionData,
            });
          }
        });
      } catch (error) {
        console.log(`No attendance data for ${dateString}`);
      }
    }

    console.log(`🔄 Found ${activities.length} recent activities`);
    return activities.slice(0, limit);
  } catch (error) {
    console.error("❌ Error fetching recent member activities:", error);
    return [];
  }
};

/**
 * Get monthly revenue trend for the last 6 months
 * @param {string} gymId - The gym ID
 * @returns {Promise<Array>} Array of monthly revenue data
 */
export const getMonthlyRevenueTrend = async (gymId) => {
  try {
    console.log("📈 Fetching monthly revenue trend...");

    const trend = [];
    const today = new Date();

    // Get last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthString = date.toISOString().substring(0, 7);

      const monthData = await calculateActualMonthlyRevenue(gymId, monthString);

      trend.push({
        month: monthString,
        revenue: monthData.revenue,
        paymentCount: monthData.paymentCount,
        formattedMonth: date.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        }),
      });
    }

    console.log("📈 Monthly revenue trend:", trend);
    return trend;
  } catch (error) {
    console.error("❌ Error fetching monthly revenue trend:", error);
    return [];
  }
};
