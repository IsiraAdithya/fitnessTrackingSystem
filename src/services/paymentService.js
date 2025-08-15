// src/services/paymentService.js
import {
  collection,
  query,
  getDocs,
  addDoc,
  orderBy,
  serverTimestamp,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { updateMember } from "./memberService";

/**
 * Fetches the payment history for a specific member.
 * @param {string} gymId - The ID of the gym.
 * @param {string} memberId - The ID of the member.
 * @returns {Promise<Array>} - An array of payment history objects.
 */
export const getPaymentHistory = async (gymId, memberId) => {
  try {
    const paymentsRef = collection(db, "gyms", gymId, "members", memberId, "payments");
    const q = query(paymentsRef, orderBy("paymentDate", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error("Error fetching payment history:", error);
    throw new Error("Could not fetch payment history.");
  }
};

/**
 * Records a new payment for a member based on their assigned tier.
 * @param {string} gymId - The ID of the gym.
 * @param {string} memberId - The ID of the member.
 * @param {string} membershipTierId - The ID of the membership tier.
 * @returns {Promise<void>}
 */
export const recordTierBasedPayment = async (gymId, memberId, membershipTierId) => {
  try {
    if (!membershipTierId) {
      throw new Error("Member does not have an assigned membership tier.");
    }

    // 1. Get the price from the membership tier document
    const tierRef = doc(db, "gyms", gymId, "membershipTiers", membershipTierId);
    const tierSnap = await getDoc(tierRef);

    if (!tierSnap.exists()) {
      throw new Error("Membership tier not found.");
    }

    const tierData = tierSnap.data();
    const amountPaid = tierData.price;

    // 2. Create a new document in the member's 'payments' subcollection
    const paymentsRef = collection(db, "gyms", gymId, "members", memberId, "payments");
    await addDoc(paymentsRef, {
      amountPaid,
      paymentDate: serverTimestamp(),
      membershipTierId: membershipTierId,
      tierName: tierData.name,
      recordedBy: "admin",
      method: "Cash", // Default method
    });

    // 3. Update the main member document with new payment status and due date
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 30);

    await updateMember(gymId, memberId, {
      Payment_Status: "Paid",
      lastPaymentDate: new Date().toISOString().split("T")[0],
      nextPaymentDueDate: nextDueDate.toISOString().split("T")[0],
    });

    console.log(`Payment recorded: ${amountPaid} LKR for member ${memberId}`);
  } catch (error) {
    console.error("Error recording payment:", error);
    throw error;
  }
};