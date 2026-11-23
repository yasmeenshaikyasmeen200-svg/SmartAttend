import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { getToken, BASE_URL } from './api';

export default function FacultyConfirm() {
  const router = useRouter();
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  // 1. Fetch real students from the database when the screen loads
  const fetchStudents = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${BASE_URL}/api/attendance/sessions/1/records`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (response.ok) {
        setStudents(data.records);
      } else {
        Alert.alert('Error', data.message);
      }
    } catch (error: any) {
      Alert.alert('Error', 'Could not fetch students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  // 2. Approve the student
  const confirmStudent = async (studentId: number) => {
    setLoadingId(studentId);
    try {
      const token = await getToken();
      const response = await fetch(`${BASE_URL}/api/attendance/sessions/1/confirm/${studentId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to confirm');

      Alert.alert('Success', 'Attendance confirmed for student!');
      fetchStudents(); // Refresh the list to show it was approved
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoadingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3182ce" />
        <Text style={{ marginTop: 10 }}>Loading students...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Confirm Attendance</Text>
      <Text style={styles.subtitle}>Session ID: 1 (Demo)</Text>

      <FlatList
        data={students}
        keyExtractor={(item) => item.student_id.toString()}
        ListEmptyComponent={<Text>No students have marked attendance yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.info}>
              <Text style={styles.name}>{item.full_name}</Text>
              <Text style={styles.roll}>{item.roll_number}</Text>
              
              <View style={styles.statusRow}>
                <Text style={item.gps_verified ? styles.statusGood : styles.statusBad}>
                  GPS: {item.gps_verified ? '✅' : '❌'}
                </Text>
                <Text style={item.biometric_claimed ? styles.statusGood : styles.statusBad}>
                  Bio: {item.biometric_claimed ? '✅' : '❌'}
                </Text>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.btn, (!item.gps_verified || item.faculty_confirmed) && styles.btnDisabled]} 
              onPress={() => confirmStudent(item.student_id)}
              disabled={!item.gps_verified || item.faculty_confirmed || loadingId === item.student_id}
            >
              {loadingId === item.student_id ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnText}>{item.faculty_confirmed ? 'Approved' : 'Approve'}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      />

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8', padding: 20, paddingTop: 50 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1a365d', marginBottom: 5 },
  subtitle: { fontSize: 16, color: '#718096', marginBottom: 20 },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 2 },
  info: { flex: 1 },
  name: { fontSize: 18, fontWeight: 'bold', color: '#2d3748' },
  roll: { fontSize: 14, color: '#718096', marginBottom: 5 },
  statusRow: { flexDirection: 'row', gap: 15 },
  statusGood: { color: 'green', fontWeight: 'bold' },
  statusBad: { color: 'red', fontWeight: 'bold' },
  btn: { backgroundColor: '#38a169', padding: 10, borderRadius: 8, width: 90, alignItems: 'center' },
  btnDisabled: { backgroundColor: '#cbd5e0' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  backBtn: { marginTop: 10, padding: 15, alignItems: 'center' },
  backText: { color: '#718096', fontSize: 16 },
});