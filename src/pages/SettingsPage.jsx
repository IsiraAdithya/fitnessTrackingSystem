// src/pages/SettingsPage.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  getMembershipTiers,
  addMembershipTier,
  updateMembershipTier,
  deleteMembershipTier,
} from "../services/settingsService";
import Layout from "../components/layout/Layout";
import toast from "react-hot-toast";

const SettingsPage = () => {
  const { gymInfo } = useAuth();
  
  // State management
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTier, setEditingTier] = useState(null);
  
  // Form states
  const [newTierName, setNewTierName] = useState("");
  const [newTierPrice, setNewTierPrice] = useState("");
  const [newTierDescription, setNewTierDescription] = useState("");

  // Load tiers when component mounts
  useEffect(() => {
    if (gymInfo?.id) {
      fetchTiers();
    }
  }, [gymInfo]);

  const fetchTiers = async () => {
    try {
      setLoading(true);
      const tierData = await getMembershipTiers(gymInfo.id);
      setTiers(tierData);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTier = async (e) => {
    e.preventDefault();
    
    if (!newTierName.trim() || !newTierPrice) {
      return toast.error("Please enter both name and price.");
    }

    const newTier = {
      name: newTierName.trim(),
      price: parseFloat(newTierPrice),
      description: newTierDescription.trim() || "",
      isActive: true,
    };

    try {
      await addMembershipTier(gymInfo.id, newTier);
      toast.success("New membership tier added!");
      
      // Reset form
      setNewTierName("");
      setNewTierPrice("");
      setNewTierDescription("");
      
      fetchTiers(); // Refresh the list
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleEditTier = (tier) => {
    setEditingTier(tier);
    setNewTierName(tier.name);
    setNewTierPrice(tier.price.toString());
    setNewTierDescription(tier.description || "");
  };

  const handleUpdateTier = async (e) => {
    e.preventDefault();
    
    if (!editingTier) return;

    const updatedTier = {
      name: newTierName.trim(),
      price: parseFloat(newTierPrice),
      description: newTierDescription.trim() || "",
    };

    try {
      await updateMembershipTier(gymInfo.id, editingTier.id, updatedTier);
      toast.success("Membership tier updated!");
      
      // Reset form
      setEditingTier(null);
      setNewTierName("");
      setNewTierPrice("");
      setNewTierDescription("");
      
      fetchTiers(); // Refresh the list
    } catch (error) {
      toast.error(error.message);
    }
  };

  const cancelEdit = () => {
    setEditingTier(null);
    setNewTierName("");
    setNewTierPrice("");
    setNewTierDescription("");
  };

  const handleDeleteTier = async (tierId, tierName) => {
    if (window.confirm(`Are you sure you want to delete "${tierName}"? This action cannot be undone.`)) {
      try {
        await deleteMembershipTier(gymInfo.id, tierId);
        toast.success("Membership tier deleted.");
        fetchTiers(); // Refresh the list
      } catch (error) {
        toast.error(error.message);
      }
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading settings...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Gym Settings</h1>
          <p className="text-gray-600 mt-2">
            Manage your gym's membership tiers and pricing
          </p>
        </div>

        {/* Gym Info Card */}
        {gymInfo && (
          <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-lg p-6 mb-8 text-white">
            <h2 className="text-xl font-semibold mb-2">📍 {gymInfo.name}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-center space-x-2">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{gymInfo.address}</span>
              </div>
              {gymInfo.contact && (
                <div className="flex items-center space-x-2">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span>{gymInfo.contact}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Add/Edit Tier Form */}
          <div className="bg-white shadow-sm rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-6">
              {editingTier ? "Edit Membership Tier" : "Add New Membership Tier"}
            </h2>
            
            <form onSubmit={editingTier ? handleUpdateTier : handleAddTier} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tier Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Student, Premium, VIP"
                  value={newTierName}
                  onChange={(e) => setNewTierName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Monthly Price (LKR) *
                </label>
                <input
                  type="number"
                  placeholder="e.g., 2500"
                  value={newTierPrice}
                  onChange={(e) => setNewTierPrice(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  placeholder="Optional description of what this tier includes..."
                  value={newTierDescription}
                  onChange={(e) => setNewTierDescription(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  rows="3"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
                >
                  {editingTier ? "Update Tier" : "Add Tier"}
                </button>
                
                {editingTier && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="flex-1 bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Existing Tiers List */}
          <div className="bg-white shadow-sm rounded-lg">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-800">
                Current Membership Tiers ({tiers.length})
              </h2>
            </div>
            
            <div className="p-6">
              {tiers.length === 0 ? (
                <div className="text-center py-8">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No membership tiers</h3>
                  <p className="mt-1 text-sm text-gray-500">Get started by creating your first membership tier.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {tiers.map((tier) => (
                    <div key={tier.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900">{tier.name}</h3>
                          <p className="text-xl font-bold text-green-600 mt-1">
                            {formatCurrency(tier.price)}/month
                          </p>
                          {tier.description && (
                            <p className="text-sm text-gray-600 mt-2">{tier.description}</p>
                          )}
                        </div>
                        
                        <div className="flex space-x-2 ml-4">
                          <button
                            onClick={() => handleEditTier(tier)}
                            className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-blue-50 transition-colors"
                            title="Edit tier"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          
                          <button
                            onClick={() => handleDeleteTier(tier.id, tier.name)}
                            className="text-red-600 hover:text-red-800 p-2 rounded-full hover:bg-red-50 transition-colors"
                            title="Delete tier"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Debug Info (Development Only) */}
        {import.meta.env.DEV && (
          <div className="mt-8 bg-gray-100 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Debug Info (Development Only)
            </h4>
            <pre className="text-xs text-gray-600 overflow-x-auto">
              {JSON.stringify(
                {
                  gymId: gymInfo?.id,
                  tiersCount: tiers.length,
                  editingTier: editingTier?.id || null,
                },
                null,
                2
              )}
            </pre>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default SettingsPage;