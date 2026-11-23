import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { getToken, BASE_URL } from './api';

export default function StudentTimetable() {
  const router = useRouter();
  const [timetable, setTimetable] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTimetable = async () => {
      try {
        const token = await getToken();
        const response = await fetch(`${BASE_URL}/api/timetables/student`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (response.ok) setTimetable(data.timetables);
      } catch (error) {
        console.log(error);
      } finally {
        setLoading(false);
      }
    };
    fetchTimetable();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Timetable</Text>
      
      {loading ? <ActivityIndicator size="large" color="#3182ce" /> : (
        <FlatList
          data={timetable}
          keyExtractor={(item) => item.timetable_id.toString()}
          ListEmptyComponent={<Text>No classes scheduled.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.subject}>{item.subject_name}</Text>
              <Text style={styles.details}>{item.day_of_week} | {item.start_time} - {item.end_time}</Text>
              <Text style={styles.details}>Room: {item.classroom_name}</Text>
              <Text style={styles.details}>Faculty: {item.faculty_name}</Text>
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
  card: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 15, elevation: 2 },
  subject: { fontSize: 18, fontWeight: 'bold', color: '#2d3748', marginBottom: 5 },
  details: { fontSize: 14, color: '#718096', marginBottom: 2 },
  backBtn: { marginTop: 10, padding: 15, alignItems: 'center' },
  backText: { color: '#718096', fontSize: 16 },
});