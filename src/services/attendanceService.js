// src/services/attendanceService.js - COMPLETE UPDATED VERSION

import {
  collection,
  query,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  orderBy,
  where,
  limit,
  startAfter,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * Helper function to get member info for fallback data
 * Updated to handle both gymMemberId and Gym_ID fields
 */
const getMemberInfoForFallback = async (gymId, memberId) => {
  try {
    const memberRef = doc(db, "gyms", gymId, "members", memberId);
    const memberSnap = await getDoc(memberRef);

    if (memberSnap.exists()) {
      const memberData = memberSnap.data();
      return {
        name: memberData.Name || "Unknown Member",
        gymMemberId: memberData.gymMemberId || memberData.Gym_ID || "N/A", // Check both fields
        paymentStatus: memberData.Payment_Status || "Unknown",
      };
    }
  } catch (error) {
    console.warn("Could not fetch member info for fallback:", error);
  }
  return null;
};

/**
 * Helper function to parse different datetime formats from your database
 */
const parseDateTime = (dateTimeString) => {
  if (!dateTimeString) return null;

  try {
    // Handle different formats from your database
    if (typeof dateTimeString === "string") {
      // Format: "2025-07-17 06:35:30"
      if (dateTimeString.includes(" ")) {
        // Convert to ISO format for parsing
        const isoString = dateTimeString.replace(" ", "T");
        const parsed = new Date(isoString);

        // If the parsed date is invalid, try adding timezone
        if (isNaN(parsed.getTime())) {
          const parsedWithZ = new Date(isoString + "Z");
          return parsedWithZ;
        }
        return parsed;
      }

      // Try direct parsing
      const parsed = new Date(dateTimeString);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    // Handle Firestore timestamp
    if (dateTimeString.toDate) {
      return dateTimeString.toDate();
    }

    // Handle regular Date object
    if (dateTimeString instanceof Date) {
      return dateTimeString;
    }

    // Try to parse as timestamp (milliseconds)
    if (typeof dateTimeString === "number") {
      return new Date(dateTimeString);
    }

    return null;
  } catch (error) {
    console.warn("Could not parse datetime:", dateTimeString, error);
    return null;
  }
};

/**
 * Fetches attendance records for a specific date
 * Your structure: gyms/{gymId}/attendance/{YYYY-MM-DD}_{memberId}/Session1
 * @param {string} gymId - The gym ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of attendance records for the date
 */
export const getAttendanceForDate = async (gymId, date) => {
  try {
    console.log(`📅 Fetching attendance for ${gymId} on ${date}`);

    // Get ALL attendance documents and filter for the specific date
    const attendanceCollectionRef = collection(db, "gyms", gymId, "attendance");
    const attendanceSnapshot = await getDocs(attendanceCollectionRef);

    console.log(
      `🔍 Found ${attendanceSnapshot.size} total attendance documents`
    );

    let attendanceRecords = [];

    // Filter documents that start with our target date
    const targetDatePrefix = date; // e.g., "2025-07-24"

    // Process each document
    for (const docSnapshot of attendanceSnapshot.docs) {
      const docId = docSnapshot.id; // e.g., "2025-07-24_13"
      const data = docSnapshot.data();

      // Check if this document is for our target date
      if (docId.startsWith(targetDatePrefix)) {
        // Extract member ID from document ID
        const parts = docId.split("_");
        const memberId = parts.length > 1 ? parts[parts.length - 1] : "unknown";

        console.log(
          `✅ Found attendance document: ${docId} for member: ${memberId}`
        );
        console.log(`📊 Document data:`, data);

        // Try to get member info for fallback data
        let memberInfo = null;
        try {
          memberInfo = await getMemberInfoForFallback(gymId, memberId);
        } catch (error) {
          console.warn(`Could not fetch member info for ${memberId}:`, error);
        }

        // Process all sessions in this document
        Object.keys(data).forEach((key) => {
          if (key.startsWith("Session") && typeof data[key] === "object") {
            const session = data[key];

            console.log(`📝 Processing session: ${key}`, session);

            // More robust data extraction with fallbacks
            const memberName =
              session.Name ||
              session.name ||
              memberInfo?.name ||
              "Unknown Member";

            const paymentStatus =
              session.Payment_Status ||
              session.payment_status ||
              session.paymentStatus ||
              memberInfo?.paymentStatus ||
              "Unknown";

            attendanceRecords.push({
              id: `${docId}_${key}`, // Unique ID: "2025-07-24_13_Session1"
              memberId: memberId, // Extracted from document ID
              gymMemberId:
                memberInfo?.gymMemberId ||
                session.gymMemberId ||
                session.Gym_ID ||
                "N/A", // Check multiple fields, fallback to N/A
              memberName: memberName,
              checkInTime: parseDateTime(
                session.Logged_in_Time ||
                  session.logged_in_time ||
                  session.checkInTime
              ),
              checkOutTime: parseDateTime(
                session.Logged_out_Time ||
                  session.logged_out_time ||
                  session.checkOutTime
              ),
              paymentStatus: paymentStatus,
              recordedBy: session.recordedBy || "fingerprint",
              sessionCount: session.SessionCount || session.sessionCount || 1,
              date: session.date || date,
              originalDocId: docId,
              originalSessionId: key,
            });
          }
        });

        // Handle documents that don't have Session structure (direct session data)
        if (!Object.keys(data).some((key) => key.startsWith("Session"))) {
          if (data.Name || data.Logged_in_Time) {
            console.log(`📝 Processing document as single session:`, data);

            const memberName =
              data.Name || data.name || memberInfo?.name || "Unknown Member";

            const paymentStatus =
              data.Payment_Status ||
              data.payment_status ||
              data.paymentStatus ||
              memberInfo?.paymentStatus ||
              "Unknown";

            attendanceRecords.push({
              id: docId,
              memberId: memberId,
              gymMemberId:
                memberInfo?.gymMemberId ||
                data.gymMemberId ||
                data.Gym_ID ||
                "N/A", // Check multiple fields, fallback to N/A
              memberName: memberName,
              checkInTime: parseDateTime(
                data.Logged_in_Time || data.logged_in_time || data.checkInTime
              ),
              checkOutTime: parseDateTime(
                data.Logged_out_Time ||
                  data.logged_out_time ||
                  data.checkOutTime
              ),
              paymentStatus: paymentStatus,
              recordedBy: data.recordedBy || "fingerprint",
              sessionCount: data.SessionCount || data.sessionCount || 1,
              date: data.date || date,
              originalDocId: docId,
              originalSessionId: "main",
            });
          }
        }
      }
    }

    // Sort by check-in time (most recent first)
    attendanceRecords.sort((a, b) => {
      if (!a.checkInTime) return 1;
      if (!b.checkInTime) return -1;
      return a.checkInTime - b.checkInTime;
    });

    console.log(
      `✅ Found ${attendanceRecords.length} attendance records for ${date}`
    );
    console.log(`📋 Final Records:`, attendanceRecords);

    return attendanceRecords;
  } catch (error) {
    console.error("❌ Error fetching attendance for date:", error);
    return [];
  }
};

/**
 * Gets attendance grouped by member for a specific date
 * @param {string} gymId - The gym ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of grouped attendance records by member
 */
export const getGroupedAttendanceForDate = async (gymId, date) => {
  try {
    // Get all attendance records for the date
    const allRecords = await getAttendanceForDate(gymId, date);

    // Group by member ID
    const memberGroups = {};

    allRecords.forEach((record) => {
      const memberId = record.memberId;

      if (!memberGroups[memberId]) {
        memberGroups[memberId] = {
          memberId: memberId,
          memberName: record.memberName,
          gymMemberId: record.gymMemberId,
          paymentStatus: record.paymentStatus,
          sessions: [],
          totalSessions: 0,
          firstCheckIn: null,
          lastCheckOut: null,
          currentStatus: "OUT", // 'IN' or 'OUT'
          totalTimeSpent: 0, // in minutes
        };
      }

      const group = memberGroups[memberId];

      // Add session to the group
      group.sessions.push({
        sessionId:
          record.originalSessionId || `Session${group.sessions.length + 1}`,
        checkInTime: record.checkInTime,
        checkOutTime: record.checkOutTime,
        duration:
          record.checkOutTime && record.checkInTime
            ? Math.round(
                (record.checkOutTime - record.checkInTime) / (1000 * 60)
              )
            : null,
      });

      group.totalSessions = group.sessions.length;

      // Update first check-in
      if (
        !group.firstCheckIn ||
        (record.checkInTime && record.checkInTime < group.firstCheckIn)
      ) {
        group.firstCheckIn = record.checkInTime;
      }

      // Update last check-out
      if (
        record.checkOutTime &&
        (!group.lastCheckOut || record.checkOutTime > group.lastCheckOut)
      ) {
        group.lastCheckOut = record.checkOutTime;
      }

      // Determine current status (if any session doesn't have checkout, user is IN)
      group.currentStatus = group.sessions.some((s) => !s.checkOutTime)
        ? "IN"
        : "OUT";

      // Calculate total time spent
      group.totalTimeSpent = group.sessions.reduce((total, session) => {
        return total + (session.duration || 0);
      }, 0);
    });

    // Convert to array and sort by first check-in time
    const groupedData = Object.values(memberGroups).sort((a, b) => {
      if (!a.firstCheckIn) return 1;
      if (!b.firstCheckIn) return -1;
      return a.firstCheckIn - b.firstCheckIn;
    });

    console.log(
      `✅ Grouped ${allRecords.length} records into ${groupedData.length} member groups`
    );
    return groupedData;
  } catch (error) {
    console.error("❌ Error getting grouped attendance:", error);
    return [];
  }
};

/**
 * Gets attendance for a specific member on a specific date
 * @param {string} gymId - The gym ID
 * @param {string} memberId - The member ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of attendance records for the member on that date
 */
export const getMemberAttendanceForDate = async (gymId, memberId, date) => {
  try {
    console.log(`📅 Fetching attendance for member ${memberId} on ${date}`);

    const docId = `${date}_${memberId}`;
    const attendanceDocRef = doc(db, "gyms", gymId, "attendance", docId);
    const attendanceDoc = await getDoc(attendanceDocRef);

    if (attendanceDoc.exists()) {
      const data = attendanceDoc.data();
      const records = [];

      // Process all sessions for this member
      Object.keys(data).forEach((key) => {
        if (key.startsWith("Session") && typeof data[key] === "object") {
          const session = data[key];
          records.push({
            id: `${docId}_${key}`,
            memberId: memberId,
            gymMemberId: session.gymMemberId || session.Gym_ID || "N/A",
            memberName: session.Name || "Unknown Member",
            checkInTime: parseDateTime(
              session.Logged_in_Time || session.checkInTime
            ),
            checkOutTime: parseDateTime(
              session.Logged_out_Time || session.checkOutTime
            ),
            paymentStatus: session.Payment_Status || "Unknown",
            recordedBy: "fingerprint",
            date: date,
            originalDocId: docId,
            originalSessionId: key,
          });
        }
      });

      console.log(
        `✅ Found ${records.length} records for member ${memberId} on ${date}`
      );
      return records;
    }

    return [];
  } catch (error) {
    console.error(`❌ Error fetching member attendance:`, error);
    return [];
  }
};

/**
 * Gets today's attendance summary with your current structure
 * @param {string} gymId - The gym ID
 * @returns {Promise<Object>} Today's attendance summary
 */
export const getTodayAttendanceSummary = async (gymId) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    console.log(
      `📊 Getting today's attendance summary for ${gymId} on ${today}`
    );

    const todayAttendance = await getAttendanceForDate(gymId, today);

    const summary = {
      totalCheckIns: todayAttendance.length,
      activeMembers: new Set(todayAttendance.map((record) => record.memberId))
        .size,
      paidMembersCheckIns: todayAttendance.filter(
        (record) => record.paymentStatus === "Paid"
      ).length,
      unpaidMembersCheckIns: todayAttendance.filter(
        (record) => record.paymentStatus === "Unpaid"
      ).length,
      peakHour: null,
      hourlyBreakdown: {},
    };

    // Calculate hourly breakdown
    const hourCounts = {};
    todayAttendance.forEach((record) => {
      if (record.checkInTime) {
        const hour = record.checkInTime.getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      }
    });

    summary.hourlyBreakdown = hourCounts;

    // Find peak hour
    let maxCount = 0;
    for (const [hour, count] of Object.entries(hourCounts)) {
      if (count > maxCount) {
        maxCount = count;
        summary.peakHour = parseInt(hour);
      }
    }

    console.log(`✅ Today's attendance summary:`, summary);
    return summary;
  } catch (error) {
    console.error("❌ Error getting today's attendance summary:", error);
    return {
      totalCheckIns: 0,
      activeMembers: 0,
      paidMembersCheckIns: 0,
      unpaidMembersCheckIns: 0,
      peakHour: null,
      hourlyBreakdown: {},
    };
  }
};

/**
 * Records new attendance (manual check-in) in your Date_MemberID format
 * @param {string} gymId - The gym ID
 * @param {string} memberId - The member ID
 * @param {Object} attendanceData - Additional attendance data
 * @returns {Promise<string>} The new document ID
 */
export const recordAttendance = async (gymId, memberId, attendanceData) => {
  try {
    console.log(
      `📝 Recording attendance for member ${memberId} at gym ${gymId}`
    );

    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    // Create Sri Lankan time (UTC+5:30)
    const sriLankanTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    const timeString = sriLankanTime
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    // Get member info first
    const memberRef = doc(db, "gyms", gymId, "members", memberId);
    const memberSnap = await getDoc(memberRef);

    if (!memberSnap.exists()) {
      throw new Error("Member not found");
    }

    const memberData = memberSnap.data();

    // Create document ID in your format: Date_MemberID
    const docId = `${today}_${memberId}`;
    const attendanceDocRef = doc(db, "gyms", gymId, "attendance", docId);

    // Check if document already exists (member already checked in today)
    const existingDoc = await getDoc(attendanceDocRef);

    let sessionNumber = 1;
    let updateData = {};

    if (existingDoc.exists()) {
      // Member already has attendance for today, add new session
      const existingData = existingDoc.data();
      const sessionKeys = Object.keys(existingData).filter((key) =>
        key.startsWith("Session")
      );
      sessionNumber = sessionKeys.length + 1;

      console.log(
        `📝 Adding Session${sessionNumber} to existing document for member ${memberId}`
      );
    } else {
      console.log(`📝 Creating new attendance document for member ${memberId}`);
    }

    // Create the new session data
    updateData[`Session${sessionNumber}`] = {
      Logged_in_Time: timeString,
      Name: memberData.Name || "Unknown Member",
      Payment_Status: memberData.Payment_Status || "Unpaid",
      gymMemberId: memberData.gymMemberId || memberData.Gym_ID || "N/A",
      date: today,
      SessionCount: sessionNumber,
      recordedBy: attendanceData.recordedBy || "manual",
    };

    // Update or create the document
    if (existingDoc.exists()) {
      await updateDoc(attendanceDocRef, updateData);
    } else {
      await updateDoc(attendanceDocRef, updateData);
    }

    console.log(
      `✅ Attendance recorded in document: ${docId}, Session: ${sessionNumber}`
    );
    return `${docId}_Session${sessionNumber}`;
  } catch (error) {
    console.error("❌ Error recording attendance:", error);
    throw new Error(`Could not record attendance: ${error.message}`);
  }
};

/**
 * Fetches attendance records for a date range
 * @param {string} gymId - The gym ID
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Promise<Object>} Object with date as key and attendance array as value
 */
export const getAttendanceForDateRange = async (gymId, startDate, endDate) => {
  try {
    console.log(
      `📅 Fetching attendance for ${gymId} from ${startDate} to ${endDate}`
    );

    const attendanceData = {};
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Iterate through each date in the range
    for (
      let date = new Date(start);
      date <= end;
      date.setDate(date.getDate() + 1)
    ) {
      const dateString = date.toISOString().split("T")[0];
      try {
        const dayAttendance = await getAttendanceForDate(gymId, dateString);
        attendanceData[dateString] = dayAttendance;
      } catch (error) {
        attendanceData[dateString] = [];
      }
    }

    console.log(
      `✅ Fetched attendance for ${Object.keys(attendanceData).length} days`
    );
    return attendanceData;
  } catch (error) {
    console.error("❌ Error fetching attendance for date range:", error);
    throw new Error(
      "Could not fetch attendance records for the specified date range."
    );
  }
};

/**
 * Searches attendance records by member name or gym ID
 * @param {string} gymId - The gym ID
 * @param {string} searchTerm - Search term (member name or gym ID)
 * @param {string} date - Date to search in (YYYY-MM-DD format)
 * @returns {Promise<Array>} Filtered attendance records
 */
export const searchAttendanceRecords = async (gymId, searchTerm, date) => {
  try {
    console.log(
      `🔍 Searching attendance records for "${searchTerm}" on ${date}`
    );

    const allRecords = await getAttendanceForDate(gymId, date);

    const filteredRecords = allRecords.filter(
      (record) =>
        record.memberName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (record.gymMemberId !== "N/A" &&
          record.gymMemberId
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase())) ||
        record.memberId?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    console.log(`✅ Found ${filteredRecords.length} matching records`);
    return filteredRecords;
  } catch (error) {
    console.error("❌ Error searching attendance records:", error);
    throw new Error("Could not search attendance records.");
  }
};

/**
 * Searches grouped attendance records by member name or gym ID
 * @param {string} gymId - The gym ID
 * @param {string} searchTerm - Search term (member name or gym ID)
 * @param {string} date - Date to search in (YYYY-MM-DD format)
 * @returns {Promise<Array>} Filtered grouped attendance records
 */
export const searchGroupedAttendanceRecords = async (
  gymId,
  searchTerm,
  date
) => {
  try {
    console.log(
      `🔍 Searching grouped attendance records for "${searchTerm}" on ${date}`
    );

    const allGroupedRecords = await getGroupedAttendanceForDate(gymId, date);

    const filteredRecords = allGroupedRecords.filter(
      (record) =>
        record.memberName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (record.gymMemberId !== "N/A" &&
          record.gymMemberId
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase())) ||
        record.memberId?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    console.log(`✅ Found ${filteredRecords.length} matching grouped records`);
    return filteredRecords;
  } catch (error) {
    console.error("❌ Error searching grouped attendance records:", error);
    throw new Error("Could not search grouped attendance records.");
  }
};

/**
 * Deletes an attendance session from your Date_MemberID structure
 * @param {string} gymId - The gym ID
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} recordId - The record ID (format: "YYYY-MM-DD_memberId_SessionX")
 * @returns {Promise<void>}
 */
export const deleteAttendanceRecord = async (gymId, date, recordId) => {
  try {
    console.log(`🗑️ Deleting attendance record ${recordId} for ${date}`);

    // Parse the recordId: "2025-07-17_25_Session1" -> docId: "2025-07-17_25", sessionId: "Session1"
    const parts = recordId.split("_");

    if (parts.length < 3) {
      throw new Error(`Invalid record ID format: ${recordId}`);
    }

    const sessionId = parts[parts.length - 1]; // "Session1"
    const docId = parts.slice(0, -1).join("_"); // "2025-07-17_25"

    console.log(`🗑️ Deleting from doc: ${docId}, session: ${sessionId}`);

    const attendanceDocRef = doc(db, "gyms", gymId, "attendance", docId);
    const attendanceDoc = await getDoc(attendanceDocRef);

    if (attendanceDoc.exists()) {
      const data = attendanceDoc.data();

      if (data[sessionId]) {
        // Remove the specific session
        const updatedData = { ...data };
        delete updatedData[sessionId];

        // Update the document (or delete if no sessions left)
        if (Object.keys(updatedData).length === 0) {
          await deleteDoc(attendanceDocRef);
          console.log(`✅ Deleted entire document ${docId} (no more sessions)`);
        } else {
          await updateDoc(attendanceDocRef, updatedData);
          console.log(`✅ Deleted session ${sessionId} from document ${docId}`);
        }
      } else {
        throw new Error(`Session ${sessionId} not found in document ${docId}`);
      }
    } else {
      throw new Error(`Document ${docId} not found`);
    }
  } catch (error) {
    console.error("❌ Error deleting attendance record:", error);
    throw new Error("Could not delete attendance record.");
  }
};

/**
 * Gets attendance statistics for a specific member
 * @param {string} gymId - The gym ID
 * @param {string} memberId - The member ID
 * @param {number} days - Number of days to look back (default 30)
 * @returns {Promise<Object>} Member attendance statistics
 */
export const getMemberAttendanceStats = async (gymId, memberId, days = 30) => {
  try {
    console.log(`📊 Getting attendance stats for member ${memberId}`);

    const stats = {
      totalVisits: 0,
      lastVisit: null,
      averageVisitsPerWeek: 0,
      visitDates: [],
    };

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const startDateString = startDate.toISOString().split("T")[0];
    const endDateString = endDate.toISOString().split("T")[0];

    const attendanceData = await getAttendanceForDateRange(
      gymId,
      startDateString,
      endDateString
    );

    // Process the data - filter for specific member
    for (const [date, records] of Object.entries(attendanceData)) {
      const memberVisits = records.filter(
        (record) => record.memberId === memberId
      );
      if (memberVisits.length > 0) {
        stats.totalVisits += memberVisits.length;
        stats.visitDates.push(date);

        const visitDate = new Date(date);
        if (!stats.lastVisit || visitDate > stats.lastVisit) {
          stats.lastVisit = visitDate;
        }
      }
    }

    // Calculate average visits per week
    const totalWeeks = days / 7;
    stats.averageVisitsPerWeek = parseFloat(
      (stats.totalVisits / totalWeeks).toFixed(1)
    );

    console.log(`✅ Member attendance stats calculated:`, stats);
    return stats;
  } catch (error) {
    console.error("❌ Error getting member attendance stats:", error);
    throw new Error("Could not calculate member attendance statistics.");
  }
};
