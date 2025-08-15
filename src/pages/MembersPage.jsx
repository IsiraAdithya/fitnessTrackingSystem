// src/pages/MembersPage.jsx - COMPLETE FIXED VERSION
import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  getMembersForGym,
  updateMember,
  deleteMember,
  searchMembers,
  validateGymMemberId,
  assignMembershipTier,
  recordPayment,
  getOverdueMembers,
  updatePaymentStatuses,
} from "../services/memberService";
import { getMembershipTiers } from "../services/settingsService";
import {
  recordTierBasedPayment,
  getPaymentHistory,
} from "../services/paymentService";
import Layout from "../components/layout/Layout";
import toast from "react-hot-toast";

const MembersPage = () => {
  const { gymInfo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [members, setMembers] = useState([]);
  const [membershipTiers, setMembershipTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [isPaymentHistoryModalOpen, setIsPaymentHistoryModalOpen] =
    useState(false);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [filterStatus, setFilterStatus] = useState("all");

  const [editForm, setEditForm] = useState({
    Name: "",
    Age: "",
    Address: "",
    Phone_Number: "",
    Payment_Status: "Unpaid",
    gymMemberId: "",
    membershipTierId: "",
  });

  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    method: "Cash",
    notes: "",
    date: new Date().toISOString().split("T")[0],
  });

  // Check for success message from enrollment page
  useEffect(() => {
    if (location.state?.message) {
      if (location.state.type === "success") {
        toast.success(location.state.message);
      } else {
        toast.error(location.state.message);
      }
      // Clear the state to prevent showing the message again
      navigate(location.pathname, { replace: true });
    }
  }, [location.state, navigate, location.pathname]);

  // Fetch members and tiers on component mount
  useEffect(() => {
    fetchData();
  }, [gymInfo]);

  const fetchData = async () => {
    if (!gymInfo?.id) {
      toast.error("Gym information is not available.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [memberData, tierData] = await Promise.all([
        getMembersForGym(gymInfo.id),
        getMembershipTiers(gymInfo.id),
      ]);

      setMembers(memberData);
      setMembershipTiers(tierData);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Navigate to enrollment page
  const handleAddNewMember = () => {
    navigate("/members/enroll");
  };

  // Auto-update payment statuses
  const handleUpdatePaymentStatuses = async () => {
    try {
      const result = await updatePaymentStatuses(gymInfo.id);
      if (result.updatedCount > 0) {
        toast.success(`Updated ${result.updatedCount} member payment statuses`);
        fetchData();
      } else {
        toast.info("All payment statuses are up to date");
      }
    } catch (error) {
      toast.error("Failed to update payment statuses");
    }
  };

  // Search functionality
  const handleSearch = async (term) => {
    setSearchTerm(term);
    if (!term.trim()) {
      fetchData();
      return;
    }

    try {
      const searchResults = await searchMembers(gymInfo.id, term);
      setMembers(searchResults);
    } catch (error) {
      toast.error("Search failed");
    }
  };

  // Filter members based on payment status
  const getFilteredMembers = () => {
    const today = new Date().toISOString().split("T")[0];

    switch (filterStatus) {
      case "paid":
        return members.filter((m) => m.Payment_Status === "Paid");
      case "unpaid":
        return members.filter((m) => m.Payment_Status === "Unpaid");
      case "overdue":
        return members.filter(
          (m) =>
            m.nextPaymentDue &&
            m.nextPaymentDue < today &&
            m.Payment_Status !== "Paid"
        );
      default:
        return members;
    }
  };

  // Edit member functionality
  const handleEditMember = (member) => {
    setSelectedMember(member);
    setEditForm({
      Name: member.Name || "",
      Age: member.Age || "",
      Address: member.Address || "",
      Phone_Number: member.Phone_Number || "",
      Payment_Status: member.Payment_Status || "Unpaid",
      gymMemberId: member.gymMemberId === "N/A" ? "" : member.gymMemberId || "",
      membershipTierId: member.membershipTierId || "",
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateMember = async (e) => {
    e.preventDefault();

    if (editForm.gymMemberId.trim()) {
      const validation = await validateGymMemberId(
        gymInfo.id,
        editForm.gymMemberId.trim(),
        selectedMember.id
      );
      if (!validation.isValid) {
        toast.error(validation.error);
        return;
      }
    }

    try {
      const updateData = { ...editForm };
      if (editForm.gymMemberId.trim()) {
        updateData.gymMemberId = editForm.gymMemberId.trim();
        updateData.Gym_ID = editForm.gymMemberId.trim();
      }

      await updateMember(gymInfo.id, selectedMember.id, updateData);
      toast.success("Member updated successfully");
      setIsEditModalOpen(false);
      fetchData();
    } catch (error) {
      toast.error("Failed to update member");
    }
  };

  // Payment functionality
  const handleRecordPayment = (member) => {
    setSelectedMember(member);
    const tierPrice = member.membershipTier?.price || 0;
    setPaymentForm({
      amount: tierPrice.toString(),
      method: "Cash",
      notes: "",
      date: new Date().toISOString().split("T")[0],
    });
    setIsPaymentModalOpen(true);
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();

    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }

    try {
      const paymentData = {
        amount: parseFloat(paymentForm.amount),
        method: paymentForm.method,
        notes: paymentForm.notes,
        date: paymentForm.date,
        tierName: selectedMember.membershipTier?.name || "",
        recordedBy: "admin",
      };

      await recordPayment(gymInfo.id, selectedMember.id, paymentData);
      toast.success(`Payment recorded for ${selectedMember.Name}`);
      setIsPaymentModalOpen(false);
      fetchData();
    } catch (error) {
      toast.error("Failed to record payment");
    }
  };

  // Tier assignment functionality
  const handleAssignTier = (member) => {
    setSelectedMember(member);
    setIsTierModalOpen(true);
  };

  const handleTierAssignment = async (tierId) => {
    try {
      await assignMembershipTier(gymInfo.id, selectedMember.id, tierId);
      const tier = membershipTiers.find((t) => t.id === tierId);
      toast.success(`Assigned ${tier.name} tier to ${selectedMember.Name}`);
      setIsTierModalOpen(false);
      fetchData();
    } catch (error) {
      toast.error("Failed to assign membership tier");
    }
  };
  // Quick payment based on assigned tier
  const handleQuickPayment = async (member) => {
    if (!member.membershipTierId) {
      toast.error(
        "Member doesn't have an assigned tier. Please assign a tier first."
      );
      return;
    }

    try {
      await recordTierBasedPayment(
        gymInfo.id,
        member.id,
        member.membershipTierId
      );
      toast.success(`Payment recorded for ${member.Name}`);
      fetchData(); // Refresh the data
    } catch (error) {
      toast.error(error.message);
    }
  };

  // View payment history
  const handleViewPaymentHistory = async (member) => {
    setSelectedMember(member);
    try {
      const history = await getPaymentHistory(gymInfo.id, member.id);
      setPaymentHistory(history);
      setIsPaymentHistoryModalOpen(true);
    } catch (error) {
      toast.error("Failed to load payment history");
    }
  };

  // Delete member functionality
  const handleDeleteMember = (member) => {
    setSelectedMember(member);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    try {
      await deleteMember(gymInfo.id, selectedMember.id);
      toast.success("Member deleted successfully");
      setIsDeleteModalOpen(false);
      fetchData();
    } catch (error) {
      toast.error("Failed to delete member");
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Get payment status color
  const getPaymentStatusColor = (member) => {
    const today = new Date().toISOString().split("T")[0];

    if (member.Payment_Status === "Paid") {
      return "bg-green-100 text-green-800";
    } else if (member.nextPaymentDue && member.nextPaymentDue < today) {
      return "bg-red-100 text-red-800";
    } else {
      return "bg-yellow-100 text-yellow-800";
    }
  };

  // Get payment status text
  const getPaymentStatusText = (member) => {
    const today = new Date().toISOString().split("T")[0];

    if (member.Payment_Status === "Paid") {
      return "Paid";
    } else if (member.nextPaymentDue && member.nextPaymentDue < today) {
      return "Overdue";
    } else {
      return "Unpaid";
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  const filteredMembers = getFilteredMembers();
  const overdueCount = members.filter((m) => {
    const today = new Date().toISOString().split("T")[0];
    return (
      m.nextPaymentDue &&
      m.nextPaymentDue < today &&
      m.Payment_Status !== "Paid"
    );
  }).length;

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Member Management
              </h1>
              <p className="text-gray-600 mt-2">
                Manage members, membership tiers, and payments
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleUpdatePaymentStatuses}
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
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>Update Statuses</span>
              </button>
              <button
                onClick={handleAddNewMember}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span>Enroll New Member</span>
              </button>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
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
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  Total Members
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {members.length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
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
                  Paid Members
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {members.filter((m) => m.Payment_Status === "Paid").length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
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
                <p className="text-sm font-medium text-gray-600">Overdue</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {overdueCount}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="h-8 w-8 bg-purple-100 rounded-full flex items-center justify-center">
                <svg
                  className="h-4 w-4 text-purple-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  Monthly Revenue
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {formatCurrency(
                    members.reduce((sum, m) => sum + (m.monthlyFee || 0), 0)
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white shadow-sm rounded-lg p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by name or gym member ID..."
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

            {/* Payment Status Filter */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Filter:</span>
              {[
                { key: "all", label: "All" },
                { key: "paid", label: "Paid" },
                { key: "unpaid", label: "Unpaid" },
                { key: "overdue", label: "Overdue" },
              ].map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setFilterStatus(filter.key)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    filterStatus === filter.key
                      ? "bg-blue-100 text-blue-800"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-600">
            Showing {filteredMembers.length} members
            {searchTerm && ` for "${searchTerm}"`}
            {filterStatus !== "all" && ` (${filterStatus})`}
          </div>
        </div>

        {/* Members Table */}
        <div className="bg-white shadow-sm rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Member
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Membership Tier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Next Due
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div
                          className="text-sm font-medium text-blue-600 hover:text-blue-800 cursor-pointer hover:underline"
                          onClick={() => navigate(`/members/${member.id}`)}
                          title="Click to view full profile"
                        >
                          {member.Name}
                        </div>
                        <div className="text-sm text-gray-500">
                          ID: {member.gymMemberId || "Not Set"}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {member.Phone_Number || "No phone"}
                      </div>
                      <div className="text-sm text-gray-500 max-w-xs truncate">
                        {member.Address || "No address"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {member.membershipTier ? (
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {member.membershipTier.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {formatCurrency(member.membershipTier.price)}/month
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400 italic">
                          No tier assigned
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPaymentStatusColor(
                          member
                        )}`}
                      >
                        {getPaymentStatusText(member)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {member.nextPaymentDue || "Not set"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        {/* Assign Tier Button */}
                        <button
                          onClick={() => handleAssignTier(member)}
                          className="text-purple-600 hover:text-purple-900 p-1 rounded hover:bg-purple-50"
                          title="Assign membership tier"
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
                              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                            />
                          </svg>
                        </button>

                        {/* Quick Payment Button */}
                        <button
                          onClick={() => handleQuickPayment(member)}
                          disabled={!member.membershipTierId}
                          className="text-green-600 hover:text-green-900 p-1 rounded hover:bg-green-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                          title="Quick payment (tier-based)"
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
                              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
                            />
                          </svg>
                        </button>

                        {/* Payment History Button */}
                        <button
                          onClick={() => handleViewPaymentHistory(member)}
                          className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50"
                          title="View payment history"
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
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        </button>

                        {/* Custom Payment Button (existing) */}
                        <button
                          onClick={() => handleRecordPayment(member)}
                          className="text-orange-600 hover:text-orange-900 p-1 rounded hover:bg-orange-50"
                          title="Custom payment amount"
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
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => handleEditMember(member)}
                          className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50"
                          title="Edit member"
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
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDeleteMember(member)}
                          className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50"
                          title="Delete member"
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
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredMembers.length === 0 && (
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
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                No members found
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm
                  ? "Try adjusting your search terms."
                  : "Get started by enrolling your first member."}
              </p>
              {!searchTerm && (
                <div className="mt-6">
                  <button
                    onClick={handleAddNewMember}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    <svg
                      className="-ml-1 mr-2 h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    Enroll New Member
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Edit Member Modal */}
        {isEditModalOpen && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Edit Member
                </h3>
                <form onSubmit={handleUpdateMember} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Gym Member ID
                    </label>
                    <input
                      type="text"
                      value={editForm.gymMemberId}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          gymMemberId: e.target.value,
                        })
                      }
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                      placeholder="e.g., GYM001, M123 (optional)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Name
                    </label>
                    <input
                      type="text"
                      value={editForm.Name}
                      onChange={(e) =>
                        setEditForm({ ...editForm, Name: e.target.value })
                      }
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Membership Tier
                    </label>
                    <select
                      value={editForm.membershipTierId}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          membershipTierId: e.target.value,
                        })
                      }
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    >
                      <option value="">No tier assigned</option>
                      {membershipTiers.map((tier) => (
                        <option key={tier.id} value={tier.id}>
                          {tier.name} - {formatCurrency(tier.price)}/month
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Age
                    </label>
                    <input
                      type="number"
                      value={editForm.Age}
                      onChange={(e) =>
                        setEditForm({ ...editForm, Age: e.target.value })
                      }
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Phone Number
                    </label>
                    <input
                      type="text"
                      value={editForm.Phone_Number}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          Phone_Number: e.target.value,
                        })
                      }
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Address
                    </label>
                    <textarea
                      value={editForm.Address}
                      onChange={(e) =>
                        setEditForm({ ...editForm, Address: e.target.value })
                      }
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                      rows="2"
                    />
                  </div>
                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setIsEditModalOpen(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                      Update Member
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Payment Recording Modal */}
        {isPaymentModalOpen && selectedMember && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Record Payment - {selectedMember.Name}
                </h3>
                <form onSubmit={handleSubmitPayment} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Amount (LKR)
                    </label>
                    <input
                      type="number"
                      value={paymentForm.amount}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          amount: e.target.value,
                        })
                      }
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                      required
                      min="0"
                      step="0.01"
                    />
                    {selectedMember.membershipTier && (
                      <p className="text-xs text-gray-500 mt-1">
                        Tier price:{" "}
                        {formatCurrency(selectedMember.membershipTier.price)}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Payment Method
                    </label>
                    <select
                      value={paymentForm.method}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          method: e.target.value,
                        })
                      }
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Card">Card</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Digital Wallet">Digital Wallet</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Payment Date
                    </label>
                    <input
                      type="date"
                      value={paymentForm.date}
                      onChange={(e) =>
                        setPaymentForm({ ...paymentForm, date: e.target.value })
                      }
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Notes (Optional)
                    </label>
                    <textarea
                      value={paymentForm.notes}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          notes: e.target.value,
                        })
                      }
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                      rows="2"
                      placeholder="Payment notes..."
                    />
                  </div>
                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setIsPaymentModalOpen(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                    >
                      Record Payment
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Tier Assignment Modal */}
        {isTierModalOpen && selectedMember && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Assign Membership Tier - {selectedMember.Name}
                </h3>
                <div className="space-y-3">
                  {membershipTiers.map((tier) => (
                    <div
                      key={tier.id}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => handleTierAssignment(tier.id)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h4 className="font-medium text-gray-900">
                            {tier.name}
                          </h4>
                          <p className="text-sm text-gray-600">
                            {tier.description}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-green-600">
                            {formatCurrency(tier.price)}
                          </p>
                          <p className="text-xs text-gray-500">per month</p>
                        </div>
                      </div>
                    </div>
                  ))}

                  {membershipTiers.length === 0 && (
                    <p className="text-gray-500 text-center py-4">
                      No membership tiers available. Create tiers in Settings
                      first.
                    </p>
                  )}
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <button
                    onClick={() => setIsTierModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {isDeleteModalOpen && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3 text-center">
                <svg
                  className="mx-auto mb-4 w-14 h-14 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                <h3 className="text-lg font-medium text-gray-900">
                  Delete Member
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  Are you sure you want to delete{" "}
                  <strong>{selectedMember?.Name}</strong>? This action cannot be
                  undone and will remove all payment history.
                </p>
                <div className="flex justify-center space-x-3 mt-6">
                  <button
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                  >
                    Delete Member
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Payment History Modal */}
        {isPaymentHistoryModalOpen && selectedMember && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Payment History - {selectedMember.Name}
                </h3>
                <div className="max-h-64 overflow-y-auto">
                  {paymentHistory.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">
                      No payment history found.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {paymentHistory.map((payment) => (
                        <div
                          key={payment.id}
                          className="border border-gray-200 rounded p-3"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-gray-900">
                                LKR{" "}
                                {payment.amountPaid?.toLocaleString() || "N/A"}
                              </p>
                              <p className="text-sm text-gray-600">
                                {payment.tierName || "No tier"}
                              </p>
                              <p className="text-xs text-gray-500">
                                {payment.paymentDate?.toDate
                                  ? payment.paymentDate
                                      .toDate()
                                      .toLocaleDateString()
                                  : "Date not available"}
                              </p>
                            </div>
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                              {payment.method || "Cash"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex justify-end mt-6">
                  <button
                    onClick={() => setIsPaymentHistoryModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default MembersPage;
