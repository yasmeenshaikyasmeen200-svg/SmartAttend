import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { getToken, BASE_URL } from './api';

export default function StudentReport() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const token = await getToken();
        const response = await fetch(`${BASE_URL}/api/reports/student`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (response.ok) setData(result);
      } catch (error) {
        console.log(error);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3182ce" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Attendance</Text>

      <View style={styles.overallCard}>
        <Text style={styles.overallTitle}>Overall Percentage</Text>
        <Text style={styles.overallValue}>
          {data?.overall?.attendance_percentage || 0}%
        </Text>
        <Text style={styles.overallSub}>
          Present: {data?.overall?.present_sessions || 0} / {data?.overall?.total_sessions || 0} Sessions
        </Text>
      </View>

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8', padding: 20, paddingTop: 50 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1a365d', marginBottom: 20 },
  overallCard: { backgroundColor: '#fff', padding: 30, borderRadius: 16, alignItems: 'center', elevation: 3 },
  overallTitle: { fontSize: 18, color: '#718096', marginBottom: 10 },
  overallValue: { fontSize: 48, fontWeight: 'bold', color: '#3182ce' },
  overallSub: { fontSize: 14, color: '#4a5568', marginTop: 10 },
  backBtn: { marginTop: 30, padding: 15, alignItems: 'center' },
  backText: { color: '#718096', fontSize: 16 },
});