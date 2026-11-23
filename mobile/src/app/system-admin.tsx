import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { getToken, BASE_URL } from './api';

export default function SystemAdmin() {
  const router = useRouter();
  const [colleges, setColleges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchColleges = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${BASE_URL}/api/colleges`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) setColleges(data.colleges);
    } catch (error) {
      Alert.alert('Error', 'Could not fetch colleges');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchColleges();
  }, []);

  const approveCollege = async (id: number) => {
    try {
      const token = await getToken();
      const response = await fetch(`${BASE_URL}/api/colleges/${id}/approve`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        Alert.alert('Success', 'College Approved!');
        fetchColleges(); // Refresh list
      }
    } catch (error) {
      Alert.alert('Error', 'Approval failed');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Approve Colleges</Text>
      
      {loading ? <ActivityIndicator size="large" color="#3182ce" /> : (
        <FlatList
          data={colleges}
          keyExtractor={(item) => item.college_id.toString()}
          ListEmptyComponent={<Text>No colleges registered yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.info}>
                <Text style={styles.name}>{item.college_name}</Text>
                <Text style={styles.code}>Code: {item.college_code}</Text>
                <Text style={[styles.status, item.approval_status === 'approved' ? styles.statusGood : styles.statusBad]}>
                  Status: {item.approval_status.toUpperCase()}
                </Text>
              </View>

              {item.approval_status === 'pending' && (
                <TouchableOpacity style={styles.btn} onPress={() => approveCollege(item.college_id)}>
                  <Text style={styles.btnText}>Approve</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8', padding: 20, paddingTop: 50 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1a365d', marginBottom: 20 },
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 2 },
  info: { flex: 1 },
  name: { fontSize: 18, fontWeight: 'bold', color: '#2d3748' },
  code: { fontSize: 14, color: '#718096', marginBottom: 5 },
  status: { fontSize: 14, fontWeight: 'bold' },
  statusGood: { color: 'green' },
  statusBad: { color: '#ed8936' },
  btn: { backgroundColor: '#38a169', padding: 10, borderRadius: 8, width: 90, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  backBtn: { marginTop: 10, padding: 15, alignItems: 'center' },
  backText: { color: '#718096', fontSize: 16 },
});