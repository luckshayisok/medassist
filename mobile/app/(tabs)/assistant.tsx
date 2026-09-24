import { MessageCircleQuestion, TriangleAlert } from 'lucide-react-native';
import { View } from 'react-native';
import { EmergencyButton } from '@/components/common/EmergencyButton';
import { Screen } from '@/components/common/Screen';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { DISCLAIMER } from '@/constants/app';

// The chat UI and safety layer are built in Phase 9, and verified knowledge (RAG) in Phase 10.
export default function AssistantScreen() {
  return (
    <Screen tab>
      <Text role="heading" className="text-3xl font-extrabold tracking-tight">
        Medicine assistant
      </Text>
      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-xl bg-accent">
            <Icon as={MessageCircleQuestion} size={26} className="text-primary" />
          </View>
          <CardTitle className="flex-1">Coming soon</CardTitle>
        </CardHeader>
        <CardContent className="gap-2">
          <Text>You will be able to ask questions about your prescription here, like "What is this medicine for?"</Text>
          <CardDescription>{DISCLAIMER}</CardDescription>
        </CardContent>
      </Card>
      <Card className="border-destructive">
        <CardHeader className="flex-row items-center gap-3">
          <Icon as={TriangleAlert} size={26} className="text-destructive" />
          <CardTitle className="flex-1">Feeling very unwell?</CardTitle>
        </CardHeader>
        <CardContent className="gap-3">
          <Text>Do not wait for the app. Call your doctor or emergency services.</Text>
          <EmergencyButton />
        </CardContent>
      </Card>
    </Screen>
  );
}
