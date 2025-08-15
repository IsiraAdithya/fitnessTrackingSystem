// functions/index.js
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

/**
 * A scheduled Cloud Function that runs every day at 3:00 AM to check for
 * and update the status of members with overdue payments.
 */
exports.updateOverduePayments = onSchedule(
  {
    schedule: "0 3 * * *", // Daily at 3:00 AM
    timeZone: "Asia/Colombo",
    region: "us-central1", // You can change this to your preferred region
  },
  async (event) => {
    console.log("🕐 Running daily check for overdue payments...");
    const today = new Date().toISOString().split("T")[0];
    let totalUpdated = 0;

    try {
      // Get all gyms in the database
      const gymsSnapshot = await db.collection("gyms").get();

      console.log(`📋 Found ${gymsSnapshot.size} gyms to check`);

      for (const gymDoc of gymsSnapshot.docs) {
        const gymId = gymDoc.id;
        console.log(`🏋️ Checking gym: ${gymId}`);

        // Get all members for this gym (handles both paid and never-paid members)
        const membersRef = db
          .collection("gyms")
          .doc(gymId)
          .collection("members");
        const allMembersSnapshot = await membersRef.get();

        if (allMembersSnapshot.empty) {
          console.log(`✅ No members found for gym ${gymId}`);
          continue;
        }

        const batch = db.batch();
        let gymUpdatedCount = 0;

        allMembersSnapshot.forEach((memberDoc) => {
          const memberData = memberDoc.data();
          const memberId = memberDoc.id;
          let shouldUpdate = false;
          let newStatus = memberData.Payment_Status;
          let updateData = {};

          // SCENARIO 1: Previously paid members whose payment expired
          if (
            memberData.Payment_Status === "Paid" &&
            memberData.nextPaymentDueDate &&
            memberData.nextPaymentDueDate < today
          ) {
            newStatus = "Unpaid";
            shouldUpdate = true;
            console.log(
              `⚠️ Paid member ${
                memberData.Name || memberId
              } payment expired - Due: ${memberData.nextPaymentDueDate}`
            );
          }

          // SCENARIO 2: Never-paid members who are now overdue (30+ days after enrollment)
          else if (
            (memberData.Payment_Status === "Unpaid" ||
              !memberData.Payment_Status) &&
            (!memberData.paymentHistory ||
              memberData.paymentHistory.length === 0) &&
            memberData.createdAt
          ) {
            // Calculate if 30 days have passed since enrollment
            const enrollmentDate = memberData.createdAt;
            const enrollmentDateStr = enrollmentDate.includes("T")
              ? enrollmentDate.split("T")[0]
              : enrollmentDate.substring(0, 10);

            const overdueDate = new Date(enrollmentDateStr);
            overdueDate.setDate(overdueDate.getDate() + 30);
            const overdueDateStr = overdueDate.toISOString().split("T")[0];

            if (overdueDateStr < today && !memberData.nextPaymentDueDate) {
              // Set their due date and mark as overdue
              updateData.nextPaymentDueDate = overdueDateStr;
              newStatus = "Unpaid"; // Keep as unpaid but now with a due date
              shouldUpdate = true;
              console.log(
                `⚠️ Never-paid member ${
                  memberData.Name || memberId
                } is now overdue - Enrolled: ${enrollmentDateStr}, Due: ${overdueDateStr}`
              );
            }
          }

          if (shouldUpdate) {
            updateData.Payment_Status = newStatus;
            updateData.overdueMarkedDate = today;
            updateData.lastStatusUpdate = FieldValue.serverTimestamp();

            batch.update(memberDoc.ref, updateData);
            gymUpdatedCount++;
          }
        });

        if (gymUpdatedCount > 0) {
          await batch.commit();
          console.log(
            `✅ Successfully updated ${gymUpdatedCount} members for gym ${gymId}`
          );
        }

        totalUpdated += gymUpdatedCount;
      }

      console.log(
        `🎉 Daily overdue payment check completed. Total updated: ${totalUpdated} members`
      );

      // Log summary to Firestore for admin visibility
      await db.collection("systemLogs").add({
        type: "overdue_payment_check",
        timestamp: FieldValue.serverTimestamp(),
        totalMembersUpdated: totalUpdated,
        checkDate: today,
        status: "completed",
      });
    } catch (error) {
      console.error("❌ Error during overdue payment check:", error);

      // Log error to Firestore
      await db.collection("systemLogs").add({
        type: "overdue_payment_check",
        timestamp: FieldValue.serverTimestamp(),
        error: error.message,
        checkDate: today,
        status: "failed",
      });

      throw error;
    }

    return null;
  }
);
/**
 * A scheduled Cloud Function that runs every day at 11:59 PM to automatically
 * log out any members who forgot to check out (didn't place finger when leaving)
 */
exports.autoLogoutForgottenMembers = onSchedule(
  {
    schedule: "0 22 * * *", // Daily at 11:59 PM
    timeZone: "Asia/Colombo",
    region: "us-central1",
  },
  async (event) => {
    console.log("🌙 Running auto-logout for forgotten members at 11:59 PM...");
    const today = new Date().toISOString().split("T")[0];
    const currentTime = FieldValue.serverTimestamp();
    let totalLoggedOut = 0;

    try {
      // Get all gyms in the database
      const gymsSnapshot = await db.collection("gyms").get();

      console.log(
        `📋 Found ${gymsSnapshot.size} gyms to check for auto-logout`
      );

      for (const gymDoc of gymsSnapshot.docs) {
        const gymId = gymDoc.id;
        console.log(`🏋️ Checking gym ${gymId} for incomplete sessions`);

        // Get today's attendance documents
        const attendanceRef = db
          .collection("gyms")
          .doc(gymId)
          .collection("attendance");
        const todayAttendanceQuery = attendanceRef
          .where("__name__", ">=", `${today}_`)
          .where("__name__", "<", `${today}_\uf8ff`);

        const attendanceSnapshot = await todayAttendanceQuery.get();

        if (attendanceSnapshot.empty) {
          console.log(`✅ No attendance records found for gym ${gymId} today`);
          continue;
        }

        console.log(
          `📊 Found ${attendanceSnapshot.size} attendance documents for gym ${gymId}`
        );

        let gymLoggedOutCount = 0;

        // Process each attendance document
        for (const attendanceDoc of attendanceSnapshot.docs) {
          const attendanceData = attendanceDoc.data();
          const docId = attendanceDoc.id;
          let hasUpdates = false;
          const batch = db.batch();

          // Check each session in the document
          for (let sessionNum = 1; sessionNum <= 10; sessionNum++) {
            const sessionKey = `Session${sessionNum}`;

            if (attendanceData[sessionKey]) {
              const session = attendanceData[sessionKey];

              // Check if session has login time but no logout time
              if (session.Logged_in_Time && !session.Logged_out_Time) {
                console.log(
                  `🌙 Auto-logout: ${
                    session.Name || "Unknown"
                  } in ${docId}, ${sessionKey}`
                );

                // Add logout time and auto-logout flag
                const sessionUpdatePath = `${sessionKey}.Logged_out_Time`;
                const autoLogoutFlagPath = `${sessionKey}.Auto_Logout`;
                const autoLogoutTimePath = `${sessionKey}.Auto_Logout_Time`;

                batch.update(attendanceDoc.ref, {
                  [sessionUpdatePath]: currentTime,
                  [autoLogoutFlagPath]: true,
                  [autoLogoutTimePath]: "23:59:00",
                });

                hasUpdates = true;
                gymLoggedOutCount++;
              }
            }
          }

          // Commit updates if any sessions were modified
          if (hasUpdates) {
            await batch.commit();
          }
        }

        totalLoggedOut += gymLoggedOutCount;
        console.log(
          `✅ Auto-logged out ${gymLoggedOutCount} members for gym ${gymId}`
        );
      }

      console.log(
        `🎉 Auto-logout completed. Total members logged out: ${totalLoggedOut}`
      );

      // Log summary to Firestore
      await db.collection("systemLogs").add({
        type: "auto_logout_forgotten_members",
        timestamp: FieldValue.serverTimestamp(),
        totalMembersLoggedOut: totalLoggedOut,
        logoutDate: today,
        logoutTime: "23:59:00",
        status: "completed",
        description: "Automatically logged out members who forgot to check out",
      });
    } catch (error) {
      console.error("❌ Error during auto-logout:", error);

      // Log error to Firestore
      await db.collection("systemLogs").add({
        type: "auto_logout_forgotten_members",
        timestamp: FieldValue.serverTimestamp(),
        error: error.message,
        logoutDate: today,
        status: "failed",
      });

      throw error;
    }

    return null;
  }
);

/**
 * Manual trigger for auto-logout (for testing)
 */
exports.manualAutoLogout = onRequest(
  {
    region: "us-central1",
  },
  async (req, res) => {
    try {
      console.log("🔧 Manual auto-logout triggered");

      const today = new Date().toISOString().split("T")[0];
      const currentTime = FieldValue.serverTimestamp();
      let totalLoggedOut = 0;

      const gymsSnapshot = await db.collection("gyms").get();

      for (const gymDoc of gymsSnapshot.docs) {
        const gymId = gymDoc.id;

        const attendanceRef = db
          .collection("gyms")
          .doc(gymId)
          .collection("attendance");
        const todayAttendanceQuery = attendanceRef
          .where("__name__", ">=", `${today}_`)
          .where("__name__", "<", `${today}_\uf8ff`);

        const attendanceSnapshot = await todayAttendanceQuery.get();

        for (const attendanceDoc of attendanceSnapshot.docs) {
          const attendanceData = attendanceDoc.data();
          let hasUpdates = false;
          const batch = db.batch();

          for (let sessionNum = 1; sessionNum <= 10; sessionNum++) {
            const sessionKey = `Session${sessionNum}`;

            if (attendanceData[sessionKey]) {
              const session = attendanceData[sessionKey];

              if (session.Logged_in_Time && !session.Logged_out_Time) {
                const sessionUpdatePath = `${sessionKey}.Logged_out_Time`;
                const autoLogoutFlagPath = `${sessionKey}.Auto_Logout`;
                const autoLogoutTimePath = `${sessionKey}.Auto_Logout_Time`;

                batch.update(attendanceDoc.ref, {
                  [sessionUpdatePath]: currentTime,
                  [autoLogoutFlagPath]: true,
                  [autoLogoutTimePath]: "23:59:00",
                });

                hasUpdates = true;
                totalLoggedOut++;
              }
            }
          }

          if (hasUpdates) {
            await batch.commit();
          }
        }
      }

      // Log the manual auto-logout
      await db.collection("systemLogs").add({
        type: "manual_auto_logout",
        timestamp: FieldValue.serverTimestamp(),
        totalMembersLoggedOut: totalLoggedOut,
        logoutDate: today,
        status: "completed",
        triggeredBy: "manual",
      });

      res.json({
        success: true,
        message: `Manual auto-logout completed. Logged out ${totalLoggedOut} forgotten members.`,
        totalLoggedOut,
        logoutDate: today,
      });
    } catch (error) {
      console.error("❌ Manual auto-logout failed:", error);

      await db.collection("systemLogs").add({
        type: "manual_auto_logout",
        timestamp: FieldValue.serverTimestamp(),
        error: error.message,
        logoutDate: today,
        status: "failed",
        triggeredBy: "manual",
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);
/**
 * HTTP endpoint to manually trigger overdue payment check
 * Useful for testing or manual runs
 */
exports.manualOverdueCheck = onRequest(
  {
    region: "us-central1", // Same region as the scheduled function
  },
  async (req, res) => {
    try {
      console.log("🔧 Manual overdue payment check triggered");

      const today = new Date().toISOString().split("T")[0];
      let totalUpdated = 0;

      const gymsSnapshot = await db.collection("gyms").get();

      for (const gymDoc of gymsSnapshot.docs) {
        const gymId = gymDoc.id;

        const overdueMembersQuery = db
          .collection("gyms")
          .doc(gymId)
          .collection("members")
          .where("Payment_Status", "==", "Paid")
          .where("nextPaymentDueDate", "<", today);

        const overdueSnapshot = await overdueMembersQuery.get();

        if (!overdueSnapshot.empty) {
          const batch = db.batch();

          overdueSnapshot.forEach((memberDoc) => {
            const memberRef = memberDoc.ref;
            batch.update(memberRef, {
              Payment_Status: "Unpaid",
              overdueMarkedDate: today,
              lastStatusUpdate: FieldValue.serverTimestamp(),
            });
          });

          await batch.commit();
          totalUpdated += overdueSnapshot.size;
        }
      }

      // Log the manual check
      await db.collection("systemLogs").add({
        type: "manual_overdue_check",
        timestamp: FieldValue.serverTimestamp(),
        totalMembersUpdated: totalUpdated,
        checkDate: today,
        status: "completed",
        triggeredBy: "manual",
      });

      res.json({
        success: true,
        message: `Manual overdue check completed. Updated ${totalUpdated} members.`,
        totalUpdated,
        checkDate: today,
      });
    } catch (error) {
      console.error("❌ Manual overdue check failed:", error);

      await db.collection("systemLogs").add({
        type: "manual_overdue_check",
        timestamp: FieldValue.serverTimestamp(),
        error: error.message,
        checkDate: today,
        status: "failed",
        triggeredBy: "manual",
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);
