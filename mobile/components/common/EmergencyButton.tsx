import { Phone } from 'lucide-react-native';
import { Linking } from 'react-native';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { EMERGENCY_NUMBER } from '@/constants/app';

/** Opens the phone dialer. MedAssist is not an emergency service and never handles emergencies itself. */
export function EmergencyButton() {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="border-2 border-destructive" accessibilityHint="Asks before opening your phone dialer">
          <Icon as={Phone} size={24} className="text-destructive" />
          <Text className="text-destructive">Emergency: call {EMERGENCY_NUMBER}</Text>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Call emergency services?</AlertDialogTitle>
          <AlertDialogDescription>This will open your phone to call {EMERGENCY_NUMBER}.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Text>Cancel</Text>
          </AlertDialogCancel>
          <AlertDialogAction className="bg-destructive" onPress={() => Linking.openURL(`tel:${EMERGENCY_NUMBER}`)}>
            <Text className="text-destructive-foreground">Call {EMERGENCY_NUMBER}</Text>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
