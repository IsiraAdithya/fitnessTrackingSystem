// src/services/settingsService.js
import {
  collection,
  query,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  orderBy,
} from "firebase/firestore";
import { db } from "./firebase";

// Helper function to get the membership tiers collection reference
const getTiersCollectionRef = (gymId) => {
  return collection(db, "gyms", gymId, "membershipTiers");
};

/**
 * Fetches all membership tiers for a given gym
 */
export const getMembershipTiers = async (gymId) => {
  try {
    console.log(`📋 Fetching membership tiers for gym: ${gymId}`);
    const q = query(getTiersCollectionRef(gymId), orderBy("name"));
    const querySnapshot = await getDocs(q);
    
    const tiers = querySnapshot.docs.map((doc) => ({ 
      id: doc.id, 
      ...doc.data() 
    }));
    
    console.log(`✅ Found ${tiers.length} membership tiers`);
    return tiers;
  } catch (error) {
    console.error("❌ Error fetching membership tiers:", error);
    throw new Error("Could not fetch membership tiers.");
  }
};

/**
 * Adds a new membership tier
 */
export const addMembershipTier = async (gymId, tierData) => {
  try {
    console.log(`➕ Adding new membership tier:`, tierData);
    await addDoc(getTiersCollectionRef(gymId), {
      ...tierData,
      createdAt: new Date().toISOString(),
    });
    console.log(`✅ Membership tier added successfully`);
  } catch (error) {
    console.error("❌ Error adding membership tier:", error);
    throw new Error("Could not add new membership tier.");
  }
};

/**
 * Updates an existing membership tier
 */
export const updateMembershipTier = async (gymId, tierId, updatedData) => {
  try {
    console.log(`📝 Updating membership tier ${tierId}:`, updatedData);
    const tierDocRef = doc(db, "gyms", gymId, "membershipTiers", tierId);
    await updateDoc(tierDocRef, {
      ...updatedData,
      updatedAt: new Date().toISOString(),
    });
    console.log(`✅ Membership tier updated successfully`);
  } catch (error) {
    console.error("❌ Error updating membership tier:", error);
    throw new Error("Could not update membership tier.");
  }
};

/**
 * Deletes a membership tier
 */
export const deleteMembershipTier = async (gymId, tierId) => {
  try {
    console.log(`🗑️ Deleting membership tier ${tierId}`);
    const tierDocRef = doc(db, "gyms", gymId, "membershipTiers", tierId);
    await deleteDoc(tierDocRef);
    console.log(`✅ Membership tier deleted successfully`);
  } catch (error) {
    console.error("❌ Error deleting membership tier:", error);
    throw new Error("Could not delete membership tier.");
  }
};