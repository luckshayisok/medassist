import { Tabs } from 'expo-router';
import { FloatingTabBar } from '@/components/common/FloatingTabBar';
import { useCareAlerts } from '@/hooks/useCare';
import { useDoseSync } from '@/hooks/useDoseSync';
import { useReminders } from '@/hooks/useReminders';

export default function TabsLayout() {
  // Signed-in app shell: keep OS reminders in sync and handle taps on them.
  useReminders();
  // Send dose actions to the server (works offline; syncs when back online).
  useDoseSync();
  // Caregivers: check for missed doses while the app is open (the query is off for patients).
  useCareAlerts();

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <FloatingTabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="medicines" />
      <Tabs.Screen name="schedule" />
      <Tabs.Screen name="assistant" />
      <Tabs.Screen name="alerts" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
