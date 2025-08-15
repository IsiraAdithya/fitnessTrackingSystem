// src/services/memberService.js - UPDATED WITH MEMBERSHIP TIER SUPPORT

import {
  collection,
  query,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  orderBy,
  where,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * Fetches all members for a given gym ID from Firestore with membership tier info
 * @param {string} gymId - The ID of the gym to fetch members for.
 * @returns {Promise<Array>} - An array of member objects with tier information.
 */
export const getMembersForGym = async (gymId) => {
  try {
    console.log(`Fetching members for gym: ${gymId}`);

    // Create a reference to the 'members' subcollection for the specific gym
    const membersCollectionRef = collection(db, "gyms", gymId, "members");

    // Create a query to fetch all documents, ordered by name
    const q = query(membersCollectionRef, orderBy("Name"));

    // Execute the query
    const querySnapshot = await getDocs(q);

    // Also fetch membership tiers for price calculation
    const tiersCollectionRef = collection(db, "gyms", gymId, "membershipTiers");
    const tiersSnapshot = await getDocs(tiersCollectionRef);

    // Create a map of tier ID to tier data
    const tiersMap = {};
    tiersSnapshot.docs.forEach((doc) => {
      tiersMap[doc.id] = { id: doc.id, ...doc.data() };
    });

    // Map the documents to an array of member data
    const members = querySnapshot.docs.map((doc) => {
      const docId = doc.id;
      const data = doc.data();
      const parsedFingerprintId = parseInt(docId);

      // Get tier information if member has a tier assigned
      const memberTier = data.membershipTierId
        ? tiersMap[data.membershipTierId]
        : null;

      return {
        id: docId, // This is the fingerprint ID (document ID)
        fingerprintId: isNaN(parsedFingerprintId) ? null : parsedFingerprintId,
        gymMemberId: data.gymMemberId || data.Gym_ID || "N/A",
        membershipTierId: data.membershipTierId || null,
        membershipTier: memberTier,
        monthlyFee: memberTier ? memberTier.price : 0,
        lastPaymentDate: data.lastPaymentDate || null,
        nextPaymentDue: data.nextPaymentDue || null,
        paymentHistory: data.paymentHistory || [],
        ...data, // The rest of the member data (Name, Age, etc.)
      };
    });

    console.log(
      `Successfully fetched ${members.length} members with tier information.`
    );
    return members;
  } catch (error) {
    console.error("Error fetching members:", error);
    throw new Error("Could not fetch members from the database.");
  }
};

/**
 * Fetches a single member by fingerprint ID with tier information
 * @param {string} gymId - The gym ID
 * @param {string} fingerprintId - The fingerprint ID (document ID)
 * @returns {Promise<Object>} - The member object with tier info
 */
export const getMemberById = async (gymId, fingerprintId) => {
  try {
    const memberRef = doc(db, "gyms", gymId, "members", fingerprintId);
    const memberSnap = await getDoc(memberRef);

    if (memberSnap.exists()) {
      const docId = memberSnap.id;
      const data = memberSnap.data();
      const parsedFingerprintId = parseInt(docId);

      // Get tier information if member has a tier assigned
      let memberTier = null;
      if (data.membershipTierId) {
        const tierRef = doc(
          db,
          "gyms",
          gymId,
          "membershipTiers",
          data.membershipTierId
        );
        const tierSnap = await getDoc(tierRef);
        if (tierSnap.exists()) {
          memberTier = { id: tierSnap.id, ...tierSnap.data() };
        }
      }

      return {
        id: docId,
        fingerprintId: isNaN(parsedFingerprintId) ? null : parsedFingerprintId,
        gymMemberId: data.gymMemberId || data.Gym_ID || "N/A",
        membershipTierId: data.membershipTierId || null,
        membershipTier: memberTier,
        monthlyFee: memberTier ? memberTier.price : 0,
        lastPaymentDate: data.lastPaymentDate || null,
        nextPaymentDue: data.nextPaymentDue || null,
        paymentHistory: data.paymentHistory || [],
        ...data,
      };
    } else {
      throw new Error("Member not found");
    }
  } catch (error) {
    console.error("Error fetching member:", error);
    throw new Error("Could not fetch member from the database.");
  }
};

/**
 * Updates a member's information including membership tier
 * @param {string} gymId - The gym ID
 * @param {string} fingerprintId - The fingerprint ID (document ID)
 * @param {Object} memberData - The updated member data
 * @returns {Promise<void>}
 */
export const updateMember = async (gymId, fingerprintId, memberData) => {
  try {
    const memberRef = doc(db, "gyms", gymId, "members", fingerprintId);

    // Don't allow changing the fingerprint ID
    const { fingerprintId: _, id: __, ...updateData } = memberData;

    // If membership tier is being changed, update next payment due date
    if (updateData.membershipTierId) {
      // Get the new tier to calculate next payment
      const tierRef = doc(
        db,
        "gyms",
        gymId,
        "membershipTiers",
        updateData.membershipTierId
      );
      const tierSnap = await getDoc(tierRef);

      if (tierSnap.exists()) {
        const tierData = tierSnap.data();

        // Set next payment due to 30 days from now if not already set
        if (!updateData.nextPaymentDue) {
          const nextDue = new Date();
          nextDue.setDate(nextDue.getDate() + 30);
          updateData.nextPaymentDue = nextDue.toISOString().split("T")[0];
        }

        // Update payment status based on due date
        const today = new Date().toISOString().split("T")[0];
        if (updateData.nextPaymentDue && updateData.nextPaymentDue < today) {
          updateData.Payment_Status = "Unpaid";
        }
      }
    }

    await updateDoc(memberRef, {
      ...updateData,
      updatedAt: new Date().toISOString(),
    });

    console.log(`Member ${fingerprintId} updated successfully`);
  } catch (error) {
    console.error("Error updating member:", error);
    throw new Error("Could not update member in the database.");
  }
};

/**
 * Assigns a membership tier to a member
 * @param {string} gymId - The gym ID
 * @param {string} memberId - The member ID
 * @param {string} tierId - The membership tier ID
 * @returns {Promise<void>}
 */
export const assignMembershipTier = async (gymId, memberId, tierId) => {
  try {
    console.log(`Assigning tier ${tierId} to member ${memberId}`);

    // Get tier information
    const tierRef = doc(db, "gyms", gymId, "membershipTiers", tierId);
    const tierSnap = await getDoc(tierRef);

    if (!tierSnap.exists()) {
      throw new Error("Membership tier not found");
    }

    const tierData = tierSnap.data();

    // Calculate next payment due date (30 days from now)
    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + 30);

    const memberRef = doc(db, "gyms", gymId, "members", memberId);
    await updateDoc(memberRef, {
      membershipTierId: tierId,
      nextPaymentDue: nextDue.toISOString().split("T")[0],
      updatedAt: new Date().toISOString(),
    });

    console.log(
      `Successfully assigned ${tierData.name} tier to member ${memberId}`
    );
  } catch (error) {
    console.error("Error assigning membership tier:", error);
    throw new Error("Could not assign membership tier.");
  }
};

/**
 * Records a payment for a member
 * @param {string} gymId - The gym ID
 * @param {string} memberId - The member ID
 * @param {Object} paymentData - Payment information
 * @returns {Promise<void>}
 */
export const recordPayment = async (gymId, memberId, paymentData) => {
  try {
    console.log(`Recording payment for member ${memberId}`);

    const memberRef = doc(db, "gyms", gymId, "members", memberId);
    const memberSnap = await getDoc(memberRef);

    if (!memberSnap.exists()) {
      throw new Error("Member not found");
    }

    const memberData = memberSnap.data();
    const paymentHistory = memberData.paymentHistory || [];

    // Create payment record
    const paymentRecord = {
      id: `payment_${Date.now()}`,
      amount: paymentData.amount,
      date: paymentData.date || new Date().toISOString().split("T")[0],
      method: paymentData.method || "Cash",
      notes: paymentData.notes || "",
      recordedBy: paymentData.recordedBy || "admin",
      tierName: paymentData.tierName || "",
      timestamp: new Date().toISOString(),
    };

    // Add to payment history
    paymentHistory.push(paymentRecord);

    // Calculate next payment due date
    const currentDue = new Date(memberData.nextPaymentDue || new Date());
    const nextDue = new Date(currentDue);
    nextDue.setDate(nextDue.getDate() + 30);

    // Update member record
    await updateDoc(memberRef, {
      Payment_Status: "Paid",
      lastPaymentDate: paymentRecord.date,
      nextPaymentDue: nextDue.toISOString().split("T")[0],
      paymentHistory: paymentHistory,
      updatedAt: new Date().toISOString(),
    });

    console.log(`Payment recorded successfully for member ${memberId}`);
    return paymentRecord;
  } catch (error) {
    console.error("Error recording payment:", error);
    throw new Error("Could not record payment.");
  }
};

/**
 * Gets members with overdue payments
 * @param {string} gymId - The gym ID
 * @returns {Promise<Array>} - Array of members with overdue payments
 */
export const getOverdueMembers = async (gymId) => {
  try {
    console.log(`Getting overdue members for gym: ${gymId}`);

    const members = await getMembersForGym(gymId);
    const today = new Date().toISOString().split("T")[0];

    const overdueMembers = members.filter((member) => {
      return (
        member.nextPaymentDue &&
        member.nextPaymentDue < today &&
        member.Payment_Status !== "Paid"
      );
    });

    console.log(`Found ${overdueMembers.length} overdue members`);
    return overdueMembers;
  } catch (error) {
    console.error("Error getting overdue members:", error);
    throw new Error("Could not fetch overdue members.");
  }
};

/**
 * Gets revenue analytics by membership tier
 * @param {string} gymId - The gym ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} - Revenue analytics
 */
export const getRevenueAnalytics = async (gymId, startDate, endDate) => {
  try {
    console.log(
      `Getting revenue analytics for ${gymId} from ${startDate} to ${endDate}`
    );

    const members = await getMembersForGym(gymId);
    const analytics = {
      totalRevenue: 0,
      paymentCount: 0,
      revenueByTier: {},
      revenueByMonth: {},
      averagePerMember: 0,
    };

    members.forEach((member) => {
      if (member.paymentHistory && member.paymentHistory.length > 0) {
        member.paymentHistory.forEach((payment) => {
          const paymentDate = payment.date;

          // Check if payment is within date range
          if (paymentDate >= startDate && paymentDate <= endDate) {
            analytics.totalRevenue += payment.amount;
            analytics.paymentCount++;

            // Revenue by tier
            const tierName =
              payment.tierName || member.membershipTier?.name || "No Tier";
            analytics.revenueByTier[tierName] =
              (analytics.revenueByTier[tierName] || 0) + payment.amount;

            // Revenue by month
            const month = paymentDate.substring(0, 7); // YYYY-MM
            analytics.revenueByMonth[month] =
              (analytics.revenueByMonth[month] || 0) + payment.amount;
          }
        });
      }
    });

    // Calculate average per member
    if (analytics.paymentCount > 0) {
      analytics.averagePerMember =
        analytics.totalRevenue / analytics.paymentCount;
    }

    console.log(`Revenue analytics calculated:`, analytics);
    return analytics;
  } catch (error) {
    console.error("Error calculating revenue analytics:", error);
    throw new Error("Could not calculate revenue analytics.");
  }
};

/**
 * Updates payment status for all members based on due dates
 * @param {string} gymId - The gym ID
 * @returns {Promise<Object>} - Update summary
 */
export const updatePaymentStatuses = async (gymId) => {
  try {
    console.log(`Updating payment statuses for gym: ${gymId}`);

    const members = await getMembersForGym(gymId);
    const today = new Date().toISOString().split("T")[0];

    let updatedCount = 0;
    const batch = [];

    for (const member of members) {
      let shouldUpdate = false;
      let newStatus = member.Payment_Status;

      // Check if payment is overdue (previously paid members)
      if (
        member.nextPaymentDue &&
        member.nextPaymentDue < today &&
        member.Payment_Status === "Paid"
      ) {
        newStatus = "Unpaid";
        shouldUpdate = true;
      }

      // Handle never-paid members who are now overdue (30+ days after enrollment)
      else if (
        (member.Payment_Status === "Unpaid" || !member.Payment_Status) &&
        (!member.paymentHistory || member.paymentHistory.length === 0) &&
        member.createdAt &&
        !member.nextPaymentDue
      ) {
        // Calculate if 30 days have passed since enrollment
        const enrollmentDate = member.createdAt.includes("T")
          ? member.createdAt.split("T")[0]
          : member.createdAt.substring(0, 10);

        const overdueDate = new Date(enrollmentDate);
        overdueDate.setDate(overdueDate.getDate() + 30);
        const overdueDateStr = overdueDate.toISOString().split("T")[0];

        if (overdueDateStr < today) {
          // Set their first due date and keep status as Unpaid
          const memberRef = doc(db, "gyms", gymId, "members", member.id);
          await updateDoc(memberRef, {
            nextPaymentDue: overdueDateStr,
            Payment_Status: "Unpaid",
            updatedAt: new Date().toISOString(),
          });
          updatedCount++;
          shouldUpdate = false; // Skip the regular update below since we already updated
        }
      }

      if (shouldUpdate) {
        const memberRef = doc(db, "gyms", gymId, "members", member.id);
        await updateDoc(memberRef, {
          Payment_Status: newStatus,
          updatedAt: new Date().toISOString(),
        });
        updatedCount++;
      }
    }

    console.log(`Updated payment status for ${updatedCount} members`);
    return {
      totalMembers: members.length,
      updatedCount: updatedCount,
      overdueCount: members.filter(
        (m) => m.nextPaymentDue && m.nextPaymentDue < today
      ).length,
    };
  } catch (error) {
    console.error("Error updating payment statuses:", error);
    throw new Error("Could not update payment statuses.");
  }
};

// Export existing functions (keeping them unchanged)
export const deleteMember = async (gymId, fingerprintId) => {
  try {
    const memberRef = doc(db, "gyms", gymId, "members", fingerprintId);
    await deleteDoc(memberRef);
    console.log(
      `Member with fingerprint ID ${fingerprintId} deleted successfully`
    );
  } catch (error) {
    console.error("Error deleting member:", error);
    throw new Error("Could not delete member from the database.");
  }
};

export const createMemberWithFingerprintId = async (
  gymId,
  fingerprintId,
  memberData
) => {
  try {
    const memberRef = doc(db, "gyms", gymId, "members", fingerprintId);

    await setDoc(memberRef, {
      ...memberData,
      fingerprintId: parseInt(fingerprintId),
      enrollmentStatus: "completed",
      createdAt: new Date().toISOString(),
    });

    console.log(`Member created with fingerprint ID: ${fingerprintId}`);
    return fingerprintId;
  } catch (error) {
    console.error("Error creating member with fingerprint ID:", error);
    throw new Error("Could not create member with fingerprint ID.");
  }
};

export const searchMembers = async (gymId, searchTerm) => {
  try {
    const membersCollectionRef = collection(db, "gyms", gymId, "members");
    const q = query(membersCollectionRef, orderBy("Name"));
    const querySnapshot = await getDocs(q);

    // Filter results on the client side for partial matches
    const members = querySnapshot.docs
      .map((doc) => {
        const docId = doc.id;
        const data = doc.data();
        const parsedFingerprintId = parseInt(docId);

        return {
          id: docId,
          fingerprintId: isNaN(parsedFingerprintId)
            ? null
            : parsedFingerprintId,
          gymMemberId: data.gymMemberId || data.Gym_ID || "N/A",
          ...data,
        };
      })
      .filter(
        (member) =>
          member.Name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (member.gymMemberId !== "N/A" &&
            member.gymMemberId
              ?.toLowerCase()
              .includes(searchTerm.toLowerCase())) ||
          member.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (member.fingerprintId &&
            member.fingerprintId.toString().includes(searchTerm))
      );

    return members;
  } catch (error) {
    console.error("Error searching members:", error);
    throw new Error("Could not search members in the database.");
  }
};

export const getMemberByFingerprintId = async (gymId, fingerprintId) => {
  try {
    const memberRef = doc(
      db,
      "gyms",
      gymId,
      "members",
      fingerprintId.toString()
    );
    const memberSnap = await getDoc(memberRef);

    if (memberSnap.exists()) {
      const docId = memberSnap.id;
      const data = memberSnap.data();
      const parsedFingerprintId = parseInt(docId);

      return {
        id: docId,
        fingerprintId: isNaN(parsedFingerprintId) ? null : parsedFingerprintId,
        gymMemberId: data.gymMemberId || data.Gym_ID || "N/A",
        ...data,
      };
    }

    return null;
  } catch (error) {
    console.error("Error getting member by fingerprint ID:", error);
    return null;
  }
};

export const getMembersWithEnrollmentStatus = async (gymId) => {
  try {
    const members = await getMembersForGym(gymId);

    return members.map((member) => ({
      ...member,
      hasFingerprint: !!(member.fingerprintId && !isNaN(member.fingerprintId)),
      enrollmentStatus: member.enrollmentStatus || "pending",
    }));
  } catch (error) {
    console.error("Error fetching members with enrollment status:", error);
    throw new Error("Could not fetch members with enrollment status.");
  }
};

export const validateGymMemberId = async (
  gymId,
  gymMemberId,
  excludeDocId = null
) => {
  try {
    if (!gymMemberId.trim()) {
      return { isValid: false, error: "Gym Member ID is required" };
    }

    const membersRef = collection(db, "gyms", gymId, "members");
    const querySnapshot = await getDocs(membersRef);

    // Check if ID already exists (excluding current document if updating)
    for (const doc of querySnapshot.docs) {
      if (doc.id === excludeDocId) continue; // Skip current document when updating

      const data = doc.data();
      const existingGymId = data.gymMemberId || data.Gym_ID;

      if (
        existingGymId &&
        existingGymId.toLowerCase() === gymMemberId.trim().toLowerCase()
      ) {
        return {
          isValid: false,
          error: "This Gym Member ID is already in use",
        };
      }
    }

    return { isValid: true };
  } catch (error) {
    console.error("Error validating gym member ID:", error);
    return { isValid: false, error: "Validation failed" };
  }
};
