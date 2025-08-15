// src/pages/PaymentAnalyticsPage.jsx - Revenue and Payment Analytics Dashboard
import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { getRevenueAnalytics, getOverdueMembers } from "../services/memberService";
import { getMembershipTiers } from "../services/settingsService";
import Layout from "../components/layout/Layout";
import toast from "react-hot-toast";

const PaymentAnalyticsPage = () => {
  const { gymInfo } = useAuth();
  const [analytics, setAnalytics] = useState({
    totalRevenue: 0,
    paymentCount: 0,
    revenueByTier: {},
    revenueByMonth: {},
    averagePerMember: 0,
  });
  const [overdueMembers, setOverdueMembers] = useState([]);
  const [membershipTiers, setMembershipTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (gymInfo?.id) {
      fetchAnalyticsData();
    }
  }, [gymInfo, dateRange]);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      const [analyticsData, overdueData, tiersData] = await Promise.all([
        getRevenueAnalytics(gymInfo.id, dateRange.startDate, dateRange.endDate),
        getOverdueMembers(gymInfo.id),
        getMembershipTiers(gymInfo.id)
      ]);
      
      setAnalytics(analyticsData);
      setOverdueMembers(overdueData);
      setMembershipTiers(tiersData);
    } catch (error) {
      toast.error("Failed to load analytics data");
      console.error("Analytics error:", error);
    } finally {
      setLoading(false);
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

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading analytics...</p>
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
              <h1 className="text-3xl font-bold text-gray-900">Payment Analytics</h1>
              <p className="text-gray-600 mt-1">
                Track revenue, payments, and membership performance
              </p>
            </div>
            <button
              onClick={fetchAnalyticsData}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Date Range Selector */}
        <div className="bg-white shadow-sm rounded-lg p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <h3 className="text-lg font-medium text-gray-900">Date Range</h3>
            <div className="flex items-center space-x-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div className="mt-6">
                <span className="text-sm text-gray-500">
                  {formatDate(dateRange.startDate)} - {formatDate(dateRange.endDate)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Revenue Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                <p className="text-2xl font-semibold text-gray-900">{formatCurrency(analytics.totalRevenue)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Payment Count</p>
                <p className="text-2xl font-semibold text-gray-900">{analytics.paymentCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="h-8 w-8 bg-purple-100 rounded-full flex items-center justify-center">
                <svg className="h-4 w-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Average per Payment</p>
                <p className="text-2xl font-semibold text-gray-900">{formatCurrency(analytics.averagePerMember)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="h-8 w-8 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="h-4 w-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Overdue Members</p>
                <p className="text-2xl font-semibold text-gray-900">{overdueMembers.length}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Revenue by Tier */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Membership Tier</h3>
            
            {Object.keys(analytics.revenueByTier).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(analytics.revenueByTier).map(([tierName, revenue]) => {
                  const percentage = analytics.totalRevenue > 0 ? (revenue / analytics.totalRevenue) * 100 : 0;
                  return (
                    <div key={tierName} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">{tierName}</span>
                        <span className="text-sm text-gray-600">
                          {formatCurrency(revenue)} ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No revenue data</h3>
                <p className="mt-1 text-sm text-gray-500">No payments recorded in the selected date range.</p>
              </div>
            )}
          </div>

          {/* Monthly Revenue Trend */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Revenue Trend</h3>
            
            {Object.keys(analytics.revenueByMonth).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(analytics.revenueByMonth)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([month, revenue]) => {
                    const maxRevenue = Math.max(...Object.values(analytics.revenueByMonth));
                    const percentage = maxRevenue > 0 ? (revenue / maxRevenue) * 100 : 0;
                    const monthName = new Date(month + '-01').toLocaleDateString('en-US', { 
                      month: 'short', 
                      year: 'numeric' 
                    });
                    
                    return (
                      <div key={month} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700">{monthName}</span>
                          <span className="text-sm text-gray-600">{formatCurrency(revenue)}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No monthly data</h3>
                <p className="mt-1 text-sm text-gray-500">No payments recorded to show monthly trends.</p>
              </div>
            )}
          </div>
        </div>

        {/* Overdue Members Section */}
        {overdueMembers.length > 0 && (
          <div className="mt-8 bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Overdue Members ({overdueMembers.length})
              </h3>
              <p className="text-sm text-gray-600">Members with overdue payments requiring attention</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Member</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tier</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monthly Fee</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days Overdue</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {overdueMembers.map((member) => {
                    const daysOverdue = member.nextPaymentDue 
                      ? Math.floor((new Date() - new Date(member.nextPaymentDue)) / (1000 * 60 * 60 * 24))
                      : 0;
                    
                    return (
                      <tr key={member.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{member.Name}</div>
                            <div className="text-sm text-gray-500">ID: {member.gymMemberId || 'Not Set'}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {member.membershipTier?.name || 'No Tier'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {member.monthlyFee ? formatCurrency(member.monthlyFee) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {member.nextPaymentDue || 'Not Set'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            daysOverdue > 30 ? 'bg-red-100 text-red-800' : 
                            daysOverdue > 7 ? 'bg-yellow-100 text-yellow-800' : 
                            'bg-orange-100 text-orange-800'
                          }`}>
                            {daysOverdue} days
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Membership Tier Summary */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Membership Tier Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {membershipTiers.map((tier) => (
              <div key={tier.id} className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900">{tier.name}</h4>
                <p className="text-sm text-gray-600 mb-2">{tier.description}</p>
                <div className="text-lg font-semibold text-green-600">
                  {formatCurrency(tier.price)}/month
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  Revenue: {formatCurrency(analytics.revenueByTier[tier.name] || 0)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default PaymentAnalyticsPage;