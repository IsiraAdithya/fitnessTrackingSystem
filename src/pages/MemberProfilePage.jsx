// src/pages/MemberProfilePage.jsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/layout/Layout";
import toast from "react-hot-toast";
import {
  getMemberById,
  updateMember,
  deleteMember,
  validateGymMemberId,
  assignMembershipTier,
  recordPayment,
} from "../services/memberService";
import { getMembershipTiers } from "../services/settingsService";
import { getPaymentHistory } from "../services/paymentService";
import { doc, deleteDoc } from "firebase/firestore";
import { db } from "../services/firebase";

const MemberProfilePage = () => {
  const { memberId } = useParams();
  const navigate = useNavigate();
  const { gymInfo } = useAuth();

  // State management
  const [member, setMember] = useState(null);
  const [membershipTiers, setMembershipTiers] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    gymMemberId: "",
    Name: "",
    Age: "",
    Address: "",
    Phone_Number: "",
    Payment_Status: "Unpaid",
    membershipTierId: "",
  });

  // Payment form state
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    method: "Cash",
    notes: "",
    date: new Date().toISOString().split("T")[0],
  });
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  // Load member data
  useEffect(() => {
    if (gymInfo?.id && memberId) {
      fetchMemberData();
    }
  }, [gymInfo, memberId]);

  const fetchMemberData = async () => {
    try {
      setLoading(true);
      const [memberData, tiers, payments] = await Promise.all([
        getMemberById(gymInfo.id, memberId),
        getMembershipTiers(gymInfo.id),
        getPaymentHistory(gymInfo.id, memberId),
      ]);

      setMember(memberData);
      setMembershipTiers(tiers);
      setPaymentHistory(payments);

      // Initialize edit form
      setEditForm({
        gymMemberId: memberData.gymMemberId === "N/A" ? "" : memberData.gymMemberId || "",
        Name: memberData.Name || "",
        Age: memberData.Age || "",
        Address: memberData.Address || "",
        Phone_Number: memberData.Phone_Number || "",
        Payment_Status: memberData.Payment_Status || "Unpaid",
        membershipTierId: memberData.membershipTierId || "",
      });

      // Initialize payment form
      const tierPrice = memberData.membershipTier?.price || 0;
      setPaymentForm({
        amount: tierPrice.toString(),
        method: "Cash",
        notes: "",
        date: new Date().toISOString().split("T")[0],
      });
    } catch (error) {
      console.error("Error fetching member data:", error);
      toast.error("Failed to load member data");
      navigate("/members");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!editForm.Name.trim()) {
      toast.error("Member name is required");
      return;
    }

    // Validate gym member ID if changed
    if (editForm.gymMemberId.trim() && editForm.gymMemberId !== member.gymMemberId) {
      const validation = await validateGymMemberId(
        gymInfo.id,
        editForm.gymMemberId.trim(),
        memberId
      );
      if (!validation.isValid) {
        toast.error(validation.error);
        return;
      }
    }

    try {
      setSaving(true);
      const updateData = { ...editForm };
      if (editForm.gymMemberId.trim()) {
        updateData.gymMemberId = editForm.gymMemberId.trim();
        updateData.Gym_ID = editForm.gymMemberId.trim();
      }

      await updateMember(gymInfo.id, memberId, updateData);
      toast.success("Member updated successfully");
      setEditing(false);
      fetchMemberData(); // Refresh data
    } catch (error) {
      console.error("Error updating member:", error);
      toast.error("Failed to update member");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    // Reset form to original values
    setEditForm({
      gymMemberId: member.gymMemberId === "N/A" ? "" : member.gymMemberId || "",
      Name: member.Name || "",
      Age: member.Age || "",
      Address: member.Address || "",
      Phone_Number: member.Phone_Number || "",
      Payment_Status: member.Payment_Status || "Unpaid",
      membershipTierId: member.membershipTierId || "",
    });
  };

  const handleQuickPayment = async () => {
    if (!member.membershipTierId) {
      toast.error("Member doesn't have an assigned tier. Please assign a tier first.");
      return;
    }

    try {
      await recordPayment(gymInfo.id, memberId, {
        amount: member.membershipTier.price,
        method: "Cash",
        notes: "Quick payment",
        date: new Date().toISOString().split("T")[0],
        tierName: member.membershipTier.name,
        recordedBy: "admin",
      });
      toast.success(`Payment recorded for ${member.Name}`);
      fetchMemberData(); // Refresh data
    } catch (error) {
      toast.error("Failed to record payment");
    }
  };

  const handleCustomPayment = async (e) => {
    e.preventDefault();
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }

    try {
      await recordPayment(gymInfo.id, memberId, {
        amount: parseFloat(paymentForm.amount),
        method: paymentForm.method,
        notes: paymentForm.notes,
        date: paymentForm.date,
        tierName: member.membershipTier?.name || "",
        recordedBy: "admin",
      });
      toast.success(`Payment recorded for ${member.Name}`);
      setShowPaymentForm(false);
      fetchMemberData(); // Refresh data
    } catch (error) {
      toast.error("Failed to record payment");
    }
  };

  const handleUndoLastPayment = async () => {
    if (paymentHistory.length === 0) {
      toast.error("No payments to undo");
      return;
    }

    const lastPayment = paymentHistory[0]; // Most recent payment
    
    if (window.confirm(`Are you sure you want to undo the last payment of ${formatCurrency(lastPayment.amountPaid)}?`)) {
      try {
        // Delete the payment document
        const paymentRef = doc(db, "gyms", gymInfo.id, "members", memberId, "payments", lastPayment.id);
        await deleteDoc(paymentRef);

        // Update member status to unpaid if this was their only payment
        if (paymentHistory.length === 1) {
          await updateMember(gymInfo.id, memberId, {
            Payment_Status: "Unpaid",
            lastPaymentDate: null,
            nextPaymentDue: null,
          });
        } else {
          // Update with second-to-last payment info
          const previousPayment = paymentHistory[1];
          const nextDue = new Date(previousPayment.paymentDate.toDate());
          nextDue.setDate(nextDue.getDate() + 30);
          
          await updateMember(gymInfo.id, memberId, {
            lastPaymentDate: previousPayment.paymentDate.toDate().toISOString().split("T")[0],
            nextPaymentDue: nextDue.toISOString().split("T")[0],
          });
        }

        toast.success("Last payment has been undone");
        fetchMemberData(); // Refresh data
      } catch (error) {
        console.error("Error undoing payment:", error);
        toast.error("Failed to undo payment");
      }
    }
  };

  const handleDeleteMember = async () => {
    if (window.confirm(`Are you sure you want to delete ${member.Name}? This action cannot be undone and will remove all payment history.`)) {
      try {
        await deleteMember(gymInfo.id, memberId);
        toast.success("Member deleted successfully");
        navigate("/members");
      } catch (error) {
        toast.error("Failed to delete member");
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

  const getPaymentStatusColor = (status) => {
    const today = new Date().toISOString().split("T")[0];
    if (status === "Paid") return "bg-green-100 text-green-800";
    if (member?.nextPaymentDue && member.nextPaymentDue < today) return "bg-red-100 text-red-800";
    return "bg-yellow-100 text-yellow-800";
  };

  const getPaymentStatusText = (status) => {
    const today = new Date().toISOString().split("T")[0];
    if (status === "Paid") return "Paid";
    if (member?.nextPaymentDue && member.nextPaymentDue < today) return "Overdue";
    return "Unpaid";
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading member profile...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!member) {
    return (
      <Layout>
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-gray-900">Member not found</h3>
          <button
            onClick={() => navigate("/members")}
            className="mt-4 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
          >
            Back to Members
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate("/members")}
                className="text-gray-600 hover:text-gray-900 p-2 rounded-full hover:bg-gray-100"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div className="flex items-center space-x-4">
                <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-green-600">
                    {member.Name ? member.Name.charAt(0).toUpperCase() : "U"}
                  </span>
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">{member.Name}</h1>
                  <p className="text-gray-600">Member Profile & Management</p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getPaymentStatusColor(member.Payment_Status)}`}
              >
                {getPaymentStatusText(member.Payment_Status)}
              </span>
              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Edit Profile
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Member Information */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information Card */}
            <div className="bg-white shadow-sm rounded-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Personal Information</h2>
                {editing && (
                  <div className="flex space-x-2">
                    <button
                      onClick={handleCancel}
                      disabled={saving}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name *
                  </label>
                  {editing ? (
                    <input
                      type="text"
                      name="Name"
                      value={editForm.Name}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      required
                    />
                  ) : (
                    <p className="text-gray-900 py-2">{member.Name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gym Member ID
                  </label>
                  {editing ? (
                    <input
                      type="text"
                      name="gymMemberId"
                      value={editForm.gymMemberId}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="e.g., GYM001, M123"
                    />
                  ) : (
                    <p className="text-gray-900 py-2">{member.gymMemberId || "Not Set"}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Age
                  </label>
                  {editing ? (
                    <input
                      type="number"
                      name="Age"
                      value={editForm.Age}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      min="1"
                      max="120"
                    />
                  ) : (
                    <p className="text-gray-900 py-2">{member.Age || "Not specified"}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  {editing ? (
                    <input
                      type="tel"
                      name="Phone_Number"
                      value={editForm.Phone_Number}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  ) : (
                    <p className="text-gray-900 py-2">{member.Phone_Number || "Not provided"}</p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address
                  </label>
                  {editing ? (
                    <textarea
                      name="Address"
                      value={editForm.Address}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      rows="3"
                    />
                  ) : (
                    <p className="text-gray-900 py-2">{member.Address || "Not provided"}</p>
                  )}
                </div>
              </div>

              {/* System Information */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 mb-4">System Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fingerprint ID
                    </label>
                    <p className="text-gray-900 py-2">{member.fingerprintId || "Not enrolled"}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Member Since
                    </label>
                    <p className="text-gray-900 py-2">
                      {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : "Unknown"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Last Updated
                    </label>
                    <p className="text-gray-900 py-2">
                      {member.updatedAt ? new Date(member.updatedAt).toLocaleDateString() : "Never"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Membership Information Card */}
            <div className="bg-white shadow-sm rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Membership Details</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Membership Tier
                  </label>
                  {editing ? (
                    <select
                      name="membershipTierId"
                      value={editForm.membershipTierId}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="">No tier assigned</option>
                      {membershipTiers.map((tier) => (
                        <option key={tier.id} value={tier.id}>
                          {tier.name} - {formatCurrency(tier.price)}/month
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="py-2">
                      {member.membershipTier ? (
                        <div>
                          <p className="text-gray-900 font-medium">{member.membershipTier.name}</p>
                          <p className="text-sm text-gray-600">{formatCurrency(member.membershipTier.price)}/month</p>
                        </div>
                      ) : (
                        <p className="text-gray-500 italic">No tier assigned</p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Status
                  </label>
                  {editing ? (
                    <select
                      name="Payment_Status"
                      value={editForm.Payment_Status}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="Paid">Paid</option>
                      <option value="Unpaid">Unpaid</option>
                    </select>
                  ) : (
                    <div className="py-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPaymentStatusColor(member.Payment_Status)}`}>
                        {getPaymentStatusText(member.Payment_Status)}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Payment Date
                  </label>
                  <p className="text-gray-900 py-2">{member.lastPaymentDate || "Never"}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Next Payment Due
                  </label>
                  <p className="text-gray-900 py-2">{member.nextPaymentDue || "Not set"}</p>
                </div>
              </div>
            </div>

            {/* Payment History Card */}
            <div className="bg-white shadow-sm rounded-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  Payment History ({paymentHistory.length} payments)
                </h2>
                {paymentHistory.length > 0 && (
                  <button
                    onClick={handleUndoLastPayment}
                    className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
                  >
                    Undo Last Payment
                  </button>
                )}
              </div>

              {paymentHistory.length === 0 ? (
                <div className="text-center py-8">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No payment history</h3>
                  <p className="mt-1 text-sm text-gray-500">This member hasn't made any payments yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {paymentHistory.map((payment, index) => (
                    <div key={payment.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-green-600">#{paymentHistory.length - index}</span>
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-gray-900">
                              {formatCurrency(payment.amountPaid || 0)}
                            </p>
                            <p className="text-sm text-gray-600">
                              {payment.tierName || 'No tier specified'}
                            </p>
                            {payment.notes && (
                              <p className="text-sm text-gray-500 italic">"{payment.notes}"</p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">
                            {payment.paymentDate?.toDate ? 
                              payment.paymentDate.toDate().toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              }) : 
                              'Date not available'
                            }
                          </p>
                          <div className="flex items-center justify-end space-x-2 mt-1">
                            <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                              {payment.method || 'Cash'}
                            </span>
                            <span className="text-xs text-gray-500">
                              by {payment.recordedBy || 'admin'}
                            </span>
                          </div>
                          {index === 0 && (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded mt-1 inline-block">
                              Latest
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Quick Actions */}
          <div className="space-y-6">
            {/* Payment Summary Card */}
            <div className="bg-white shadow-sm rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Payments:</span>
                  <span className="font-semibold">{paymentHistory.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Amount:</span>
                  <span className="font-semibold text-green-600">
                    {formatCurrency(paymentHistory.reduce((sum, p) => sum + (p.amountPaid || 0), 0))}
                  </span>
                </div>
                {paymentHistory.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Last Payment:</span>
                    <span className="font-semibold">
                      {formatCurrency(paymentHistory[0].amountPaid || 0)}
                    </span>
                  </div>
                )}
                {member.membershipTier && (
                  <div className="flex justify-between pt-3 border-t border-gray-200">
                    <span className="text-gray-600">Monthly Fee:</span>
                    <span className="font-semibold text-blue-600">
                      {formatCurrency(member.membershipTier.price)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions Card */}
            <div className="bg-white shadow-sm rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                {member.membershipTierId && (
                  <button
                    onClick={handleQuickPayment}
                    className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    Record Payment ({formatCurrency(member.membershipTier.price)})
                  </button>
                )}
                
                <button
                  onClick={() => setShowPaymentForm(!showPaymentForm)}
                  className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Custom Payment Amount
                </button>

                {!member.membershipTierId && (
                  <div className="text-center py-4 bg-yellow-50 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      Assign a membership tier to enable quick payments
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Custom Payment Form */}
            {showPaymentForm && (
              <div className="bg-white shadow-sm rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Record Custom Payment</h3>
                <form onSubmit={handleCustomPayment} className="space-y-4">
                  <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">
                     Amount (LKR) *
                   </label>
                   <input
                     type="number"
                     value={paymentForm.amount}
                     onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})}
                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                     required
                     min="0"
                     step="0.01"
                   />
                 </div>

                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">
                     Payment Method
                   </label>
                   <select
                     value={paymentForm.method}
                     onChange={(e) => setPaymentForm({...paymentForm, method: e.target.value})}
                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                   >
                     <option value="Cash">Cash</option>
                     <option value="Card">Card</option>
                     <option value="Bank Transfer">Bank Transfer</option>
                     <option value="Digital Wallet">Digital Wallet</option>
                   </select>
                 </div>

                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">
                     Payment Date
                   </label>
                   <input
                     type="date"
                     value={paymentForm.date}
                     onChange={(e) => setPaymentForm({...paymentForm, date: e.target.value})}
                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                     required
                   />
                 </div>

                 <div>
                   <label className="block text-sm font-medium text-gray-700 mb-2">
                     Notes (Optional)
                   </label>
                   <textarea
                     value={paymentForm.notes}
                     onChange={(e) => setPaymentForm({...paymentForm, notes: e.target.value})}
                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                     rows="2"
                     placeholder="Payment notes..."
                   />
                 </div>

                 <div className="flex space-x-3">
                   <button
                     type="button"
                     onClick={() => setShowPaymentForm(false)}
                     className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                   >
                     Cancel
                   </button>
                   <button
                     type="submit"
                     className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                   >
                     Record Payment
                   </button>
                 </div>
               </form>
             </div>
           )}

           {/* Danger Zone */}
           <div className="bg-white shadow-sm rounded-lg p-6 border border-red-200">
             <h3 className="text-lg font-semibold text-red-900 mb-4">Danger Zone</h3>
             <p className="text-sm text-red-600 mb-4">
               Once you delete a member, there is no going back. This will permanently delete all payment history.
             </p>
             <button
               onClick={handleDeleteMember}
               className="w-full bg-red-600 text-white px-4 py-3 rounded-lg hover:bg-red-700 transition-colors font-medium"
             >
               Delete Member
             </button>
           </div>
         </div>
       </div>
     </div>
   </Layout>
 );
};

export default MemberProfilePage;